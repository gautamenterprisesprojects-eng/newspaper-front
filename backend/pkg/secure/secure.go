// Package secure provides reversible AES-256-GCM encryption for the one
// piece of secret data this system deliberately keeps recoverable: publisher
// passwords, so an admin can look one up instead of always issuing a reset.
//
// This is intentionally separate from authentication: SaaSAuthLogin never
// calls Decrypt — it only ever checks the bcrypt hash in publishers.password_hash.
// Encrypt/Decrypt exist solely to back the admin panel's "view password" field.
package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"

	"github.com/enterprise/newspaper-portal-backend/internal/config"
)

// Encrypt returns a base64-encoded, nonce-prefixed AES-256-GCM ciphertext.
func Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(config.CredentialsEncryptionKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt. It fails if the ciphertext was encrypted under a
// different key (e.g. an ephemeral key from a previous process run).
func Decrypt(encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(config.CredentialsEncryptionKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
