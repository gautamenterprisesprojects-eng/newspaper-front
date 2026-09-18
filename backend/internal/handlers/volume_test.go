package handlers

import (
	"database/sql"
	"testing"
)

func TestNextVolumeNumber(t *testing.T) {
	cases := []struct {
		name       string
		pubType    string
		lastVolume int64
		lastDate   string
		newDate    string
		wantVolume int
		wantOK     bool
	}{
		{"daily, next consecutive day", "Daily", 67, "2026-08-13", "2026-08-14", 68, true},
		{"daily, one day skipped", "Daily", 67, "2026-08-13", "2026-08-15", 69, true},
		{"daily, same day regenerate keeps volume", "Daily", 67, "2026-08-14", "2026-08-14", 67, true},
		{"daily, earlier date keeps volume", "Daily", 67, "2026-08-14", "2026-08-12", 67, true},
		{"daily, same day many regenerates still same", "Daily", 272, "2026-09-18", "2026-09-18", 272, true},
		{"daily, several days skipped", "Daily", 100, "2026-08-01", "2026-08-10", 109, true},
		{"weekly, one week later", "Weekly", 10, "2026-08-01", "2026-08-08", 11, true},
		{"weekly, two weeks later (one skipped)", "Weekly", 10, "2026-08-01", "2026-08-15", 12, true},
		{"weekly, mid-week regenerate (less than a week)", "Weekly", 10, "2026-08-01", "2026-08-03", 10, true},
		{"no baseline set yet", "Daily", 0, "", "2026-08-14", 0, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var lastVolume sql.NullInt64
			var lastDate sql.NullString
			if tc.lastDate != "" {
				lastVolume = sql.NullInt64{Int64: tc.lastVolume, Valid: true}
				lastDate = sql.NullString{String: tc.lastDate, Valid: true}
			}

			got, ok := nextVolumeNumber(tc.pubType, lastVolume, lastDate, tc.newDate)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if ok && got != tc.wantVolume {
				t.Fatalf("volume = %d, want %d", got, tc.wantVolume)
			}
		})
	}
}
