-- Stores the locked (password-protected) PDF issued to a publisher at
-- approval time, containing their login credentials. The PDF's own open
-- password is chosen by the admin at issue time and is never persisted --
-- pdfcpu encrypts it into the file itself, so losing that password makes the
-- specific PDF unrecoverable, same as any other password-protected document.

CREATE TABLE IF NOT EXISTS publisher_credential_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    pdf_data BYTEA NOT NULL,
    issued_by VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pub_cred_docs_publisher ON publisher_credential_documents(publisher_id, created_at DESC);
