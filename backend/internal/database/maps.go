package database

import (
	"database/sql"
)

// sqlx's Get/Select cannot scan into map[string]interface{}: isScannable() treats
// a map as a scannable value, so any query returning more than one column fails
// with "scannable dest type map with >1 columns". These helpers use MapScan,
// which is the supported path for dynamic column sets.

// normalizeValue converts driver []byte values into strings so JSON responses
// carry readable text rather than base64-encoded blobs.
func normalizeValue(v interface{}) interface{} {
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}

// QueryMaps returns every row of a query as a column-name keyed map.
func QueryMaps(query string, args ...interface{}) ([]map[string]interface{}, error) {
	if DB == nil {
		return nil, sql.ErrConnDone
	}

	rows, err := DB.Queryx(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]map[string]interface{}, 0)
	for rows.Next() {
		row := map[string]interface{}{}
		if err := rows.MapScan(row); err != nil {
			return nil, err
		}
		for k, v := range row {
			row[k] = normalizeValue(v)
		}
		results = append(results, row)
	}

	return results, rows.Err()
}

// QueryMap returns the first row of a query, or sql.ErrNoRows if there is none.
func QueryMap(query string, args ...interface{}) (map[string]interface{}, error) {
	rows, err := QueryMaps(query, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, sql.ErrNoRows
	}
	return rows[0], nil
}
