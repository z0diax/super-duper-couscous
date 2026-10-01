CREATE TABLE IF NOT EXISTS payroll_read_batches (
 id VARCHAR(190) PRIMARY KEY, batch_number VARCHAR(190) NULL, batch_barcode VARCHAR(190) NULL,
 payroll_type VARCHAR(190) NULL, office VARCHAR(190) NULL, encoded_by_user_id VARCHAR(64) NULL,
 date_encoded VARCHAR(40) NULL, updated_at VARCHAR(40) NULL, derived_status VARCHAR(64) NULL, initial_active INT NOT NULL DEFAULT 0,
 management_active INT NOT NULL DEFAULT 0, management_on_hold INT NOT NULL DEFAULT 0, release_ready INT NOT NULL DEFAULT 0,
 initial_user_id VARCHAR(64) NULL, initial_role VARCHAR(64) NULL, initial_team VARCHAR(190) NULL,
 release_user_id VARCHAR(64) NULL, release_role VARCHAR(64) NULL, release_team VARCHAR(190) NULL,
 source_sha256 CHAR(64) NOT NULL,
 INDEX idx_prb_number (batch_number), INDEX idx_prb_barcode (batch_barcode),
 INDEX idx_prb_owner_date (encoded_by_user_id,date_encoded), INDEX idx_prb_date (date_encoded), INDEX idx_prb_updated (updated_at),
 INDEX idx_prb_initial_user (initial_user_id), INDEX idx_prb_initial_role (initial_role),
 INDEX idx_prb_initial_team (initial_team), INDEX idx_prb_release_user (release_user_id),
 INDEX idx_prb_release_role (release_role), INDEX idx_prb_release_team (release_team)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payroll_read_items (
 id VARCHAR(190) PRIMARY KEY, batch_id VARCHAR(190) NOT NULL, document_id VARCHAR(190) NULL, item_number INT NULL,
 barcode VARCHAR(190) NULL, title VARCHAR(300) NULL, office VARCHAR(190) NULL,
 classification_type VARCHAR(190) NULL, employment_classification VARCHAR(100) NULL,
 current_stage VARCHAR(64) NULL, status VARCHAR(64) NULL, verification_status VARCHAR(64) NULL, hold_resolved_at VARCHAR(40) NULL,
 assigned_user_id VARCHAR(64) NULL, work_group_id VARCHAR(190) NULL,
 source_sha256 CHAR(64) NOT NULL,
 INDEX idx_pri_batch_stage (batch_id,current_stage), INDEX idx_pri_batch_number (batch_id,item_number), INDEX idx_pri_barcode (barcode),
 INDEX idx_pri_assigned (assigned_user_id,status), INDEX idx_pri_group (work_group_id),
 INDEX idx_pri_status_stage (status,current_stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payroll_read_groups (
 id VARCHAR(190) PRIMARY KEY, batch_id VARCHAR(190) NOT NULL, processor_id VARCHAR(64) NULL,
 assigned_team VARCHAR(190) NULL, status VARCHAR(64) NULL, source_sha256 CHAR(64) NOT NULL,
 INDEX idx_prg_batch (batch_id), INDEX idx_prg_processor_status (processor_id,status),
 INDEX idx_prg_team_status (assigned_team,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payroll_read_group_items (
 group_id VARCHAR(190) NOT NULL, item_id VARCHAR(190) NOT NULL,
 PRIMARY KEY (group_id,item_id), INDEX idx_prgi_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
