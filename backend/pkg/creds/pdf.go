// Package creds generates the locked PDF handed to a newly approved
// publisher, containing the login identity an admin issued for them.
//
// The sheet is Devanagari (Hindi), which pure-Go PDF libraries render
// incorrectly: Indic scripts need real text shaping (conjunct ligatures like
// त्र, ज्ञ, and pre-base vowel reordering like "वि") that libraries such as
// gofpdf do not implement — they just place one glyph per Unicode codepoint
// in encoding order, which is visibly wrong for Hindi. A real browser engine
// does this correctly, so this package renders the sheet as HTML and prints
// it to PDF via a locally installed Chromium-family browser (driven through
// the DevTools Protocol), then locks the result with pdfcpu.
package creds

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"net/url"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Info is the publisher and credential data rendered onto the sheet.
type Info struct {
	NewspaperName string
	OwnerName     string
	City          string
	State         string
	Mobile        string
	Email         string
	Username      string
	Password      string
	LoginURL      string
	IssuedBy      string
}

var sheetTemplate = template.Must(template.New("credentials").Parse(`
<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Nirmala UI", "Nirmala Text", "Mangal", sans-serif;
    color: #1f2937;
    margin: 0;
    padding: 0 40px 40px 40px;
    font-size: 14px;
  }
  .header {
    background: #111827;
    color: #ffffff;
    margin: 0 -40px 24px -40px;
    padding: 22px 40px;
    font-size: 19px;
    font-weight: 700;
  }
  h2 {
    font-size: 14px;
    font-weight: 700;
    color: #4338ca;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 6px;
    margin: 22px 0 10px 0;
  }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 6px 0; vertical-align: top; }
  td.label { width: 190px; font-weight: 700; color: #374151; }
  td.value { color: #111827; }
  .warning {
    margin-top: 26px;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 12px 16px;
    font-weight: 700;
    font-size: 13px;
  }
</style>
</head>
<body>
  <div class="header">समाचार पत्र प्रकाशक — लॉगिन जानकारी</div>

  <h2>प्रकाशक विवरण</h2>
  <table>
    <tr><td class="label">समाचार पत्र:</td><td class="value">{{.NewspaperName}}</td></tr>
    <tr><td class="label">मालिक का नाम:</td><td class="value">{{.OwnerName}}</td></tr>
    <tr><td class="label">शहर / राज्य:</td><td class="value">{{.City}}, {{.State}}</td></tr>
    <tr><td class="label">मोबाइल:</td><td class="value">{{.Mobile}}</td></tr>
    <tr><td class="label">ईमेल:</td><td class="value">{{.Email}}</td></tr>
  </table>

  <h2>लॉगिन विवरण</h2>
  <table>
    <tr><td class="label">यूज़र आईडी:</td><td class="value">{{.Username}}</td></tr>
    <tr><td class="label">पासवर्ड:</td><td class="value">{{.Password}}</td></tr>
    <tr><td class="label">लॉगिन लिंक:</td><td class="value">{{.LoginURL}}</td></tr>
  </table>

  <h2>जारी करने की जानकारी</h2>
  <table>
    <tr><td class="label">जारी करने वाला एडमिन:</td><td class="value">{{.IssuedBy}}</td></tr>
    <tr><td class="label">तारीख़:</td><td class="value">{{.IssuedOn}}</td></tr>
  </table>

  <div class="warning">कृपया यह जानकारी सुरक्षित रखें और किसी और के साथ साझा न करें। पासवर्ड बदलने के लिए एडमिन से संपर्क करें।</div>
</body>
</html>
`))

type sheetData struct {
	Info
	IssuedOn string
}

// findBrowser locates a locally installed Chromium-family browser. Checked in
// order: common Windows install paths for Edge/Chrome, then PATH lookups for
// the binary names used on Linux (the names a Docker image would install).
func findBrowser() (string, error) {
	if runtime.GOOS == "windows" {
		candidates := []string{
			`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
		}
		for _, c := range candidates {
			if _, err := exec.LookPath(c); err == nil {
				return c, nil
			}
			// exec.LookPath on an absolute path just stats it; try that directly too.
			if fi, err := exec.Command(c, "--version").Output(); err == nil && len(fi) > 0 {
				return c, nil
			}
		}
	}

	for _, name := range []string{"microsoft-edge", "msedge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}

	return "", fmt.Errorf("no Chromium-family browser found (checked Edge/Chrome); install one to enable credentials PDF generation")
}

// renderHTMLToPDF prints htmlDoc to PDF using a headless browser, with the
// print header/footer (URL, date, page number) explicitly disabled.
func renderHTMLToPDF(ctx context.Context, htmlDoc string) ([]byte, error) {
	browserPath, err := findBrowser()
	if err != nil {
		return nil, err
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(browserPath),
		chromedp.NoSandbox,
		chromedp.DisableGPU,
	)
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	defer cancelAlloc()

	taskCtx, cancelTask := chromedp.NewContext(allocCtx)
	defer cancelTask()

	dataURL := "data:text/html;charset=utf-8," + url.QueryEscape(htmlDoc)

	var pdfBytes []byte
	err = chromedp.Run(taskCtx,
		chromedp.Navigate(dataURL),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithPrintBackground(true).
				WithDisplayHeaderFooter(false).
				WithMarginTop(0).WithMarginBottom(0).WithMarginLeft(0).WithMarginRight(0).
				Do(ctx)
			if err != nil {
				return err
			}
			pdfBytes = buf
			return nil
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("rendering credentials pdf via headless browser: %w", err)
	}

	return pdfBytes, nil
}

// GeneratePublisherCredentialsPDF renders a Hindi-language credentials sheet
// and locks it with lockPassword using AES-256 PDF encryption, so the file is
// unreadable without that password. lockPassword is never persisted anywhere
// by this function or its callers — losing it makes this specific PDF
// permanently unrecoverable, the same as any other password-protected file.
func GeneratePublisherCredentialsPDF(info Info, lockPassword string) ([]byte, error) {
	var html strings.Builder
	data := sheetData{Info: info, IssuedOn: time.Now().Format("2 January 2006")}
	if err := sheetTemplate.Execute(&html, data); err != nil {
		return nil, fmt.Errorf("rendering credentials html: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	unlocked, err := renderHTMLToPDF(ctx, html.String())
	if err != nil {
		return nil, err
	}

	conf := model.NewAESConfiguration(lockPassword, lockPassword, 256)
	var locked bytes.Buffer
	if err := api.Encrypt(bytes.NewReader(unlocked), &locked, conf); err != nil {
		return nil, fmt.Errorf("locking credentials pdf: %w", err)
	}

	return locked.Bytes(), nil
}
