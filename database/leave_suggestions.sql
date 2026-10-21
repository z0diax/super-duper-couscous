CREATE TABLE IF NOT EXISTS leave_suggestions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    category ENUM('medical','destination') NOT NULL,
    scope_key VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    display_value VARCHAR(2000) NOT NULL,
    normalized_value VARCHAR(2000) COLLATE utf8mb4_bin NOT NULL,
    value_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    location_type ENUM('WITHIN_PHILIPPINES','ABROAD') NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_leave_suggestion (category, scope_key, value_hash),
    KEY idx_leave_suggestion_search (category, scope_key, normalized_value(100)),
    CONSTRAINT chk_leave_suggestion_scope CHECK (
        (category='medical' AND scope_key<>'') OR (category='destination' AND scope_key='')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
