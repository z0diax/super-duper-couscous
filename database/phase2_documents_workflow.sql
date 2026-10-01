-- Additive shadow schema. Run through scripts/backfill_documents_workflow.php.
-- Source JSON remains authoritative in app_records.
CREATE TABLE IF NOT EXISTS workflow_templates (
 id VARCHAR(190) NOT NULL, version INT NOT NULL, is_current TINYINT(1) NOT NULL DEFAULT 1,
 classification VARCHAR(100) NULL, document_type VARCHAR(190) NULL,
 employment_classification VARCHAR(100) NULL, title VARCHAR(300) NULL,
 description TEXT NULL, is_active TINYINT(1) NULL,
 source_json LONGTEXT NOT NULL, source_sha256 CHAR(64) NOT NULL,
 PRIMARY KEY (id,version), INDEX idx_workflow_route (classification,is_active,employment_classification),
 CHECK (JSON_VALID(source_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workflow_template_document_types (
 template_id VARCHAR(190) NOT NULL, template_version INT NOT NULL, position INT NOT NULL,
 document_type VARCHAR(190) NOT NULL,
 PRIMARY KEY (template_id,template_version,position), INDEX idx_template_type (document_type,template_id),
 CONSTRAINT fk_template_type_parent FOREIGN KEY (template_id,template_version) REFERENCES workflow_templates(id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workflow_template_steps (
 template_id VARCHAR(190) NOT NULL, template_version INT NOT NULL, step_number INT NOT NULL,
 name VARCHAR(300) NULL, description TEXT NULL, stage_type VARCHAR(64) NULL,
 assignee_type VARCHAR(32) NULL, assignee_role VARCHAR(64) NULL,
 assignee_team VARCHAR(190) NULL, assignee_user_id VARCHAR(64) NULL,
 assignee_name VARCHAR(190) NULL, sla_hours DECIMAL(12,2) NULL,
 required_action VARCHAR(100) NULL, allow_return TINYINT(1) NULL,
 allow_hold TINYINT(1) NULL, requires_attachment TINYINT(1) NULL,
 assignment_source VARCHAR(64) NULL, payroll_assignment_source VARCHAR(64) NULL,
 external_purpose VARCHAR(100) NULL, external_destination_mode VARCHAR(64) NULL,
 external_destination_office VARCHAR(190) NULL, return_receiver_type VARCHAR(32) NULL,
 return_receiver_role VARCHAR(64) NULL, return_receiver_team VARCHAR(190) NULL,
 return_receiver_user_id VARCHAR(64) NULL, expected_turnaround_hours DECIMAL(12,2) NULL,
 source_json LONGTEXT NOT NULL, source_sha256 CHAR(64) NOT NULL,
 PRIMARY KEY (template_id,template_version,step_number),
 CONSTRAINT fk_template_step_parent FOREIGN KEY (template_id,template_version) REFERENCES workflow_templates(id,version),
 CHECK (JSON_VALID(source_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS documents (
 id VARCHAR(190) PRIMARY KEY, tracking_number VARCHAR(190) NULL, barcode VARCHAR(190) NULL,
 title VARCHAR(300) NULL, subject TEXT NULL, source_type VARCHAR(32) NULL,
 source_office VARCHAR(190) NULL, sender_name VARCHAR(190) NULL, sender_contact VARCHAR(190) NULL,
 classification VARCHAR(100) NULL, document_type VARCHAR(190) NULL,
 employment_classification VARCHAR(100) NULL, priority VARCHAR(32) NULL,
 date_received VARCHAR(40) NULL, date_encoded VARCHAR(40) NULL, description TEXT NULL,
 status VARCHAR(64) NULL, current_step_number INT NULL, total_steps INT NULL,
 workflow_template_id VARCHAR(190) NULL, workflow_version INT NULL,
 current_location VARCHAR(190) NULL, encoded_by_user_id VARCHAR(64) NULL,
 encoded_by_name VARCHAR(190) NULL, is_legacy_v1 TINYINT(1) NULL,
 legacy_id VARCHAR(190) NULL, legacy_source VARCHAR(190) NULL,
 hold_reason TEXT NULL, held_at VARCHAR(40) NULL, held_by_user_id VARCHAR(64) NULL,
 compliance_submitted_at VARCHAR(40) NULL, released_at VARCHAR(40) NULL,
 released_to VARCHAR(190) NULL, release_mode VARCHAR(100) NULL,
 source_json LONGTEXT NOT NULL, source_sha256 CHAR(64) NOT NULL,
 INDEX idx_document_tracking (tracking_number), INDEX idx_document_barcode (barcode), INDEX idx_document_legacy_id (legacy_id),
 INDEX idx_document_status_step (status,current_step_number),
 INDEX idx_document_class_type (classification,document_type),
 INDEX idx_document_template (workflow_template_id),
 INDEX idx_document_encoder (encoded_by_user_id,status),
 CHECK (JSON_VALID(source_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS document_workflow_steps (
 document_id VARCHAR(190) NOT NULL, step_number INT NOT NULL,
 name VARCHAR(300) NULL, stage_type VARCHAR(64) NULL, required_action VARCHAR(100) NULL,
 status VARCHAR(64) NULL, assignment_type VARCHAR(32) NULL,
 assigned_role VARCHAR(64) NULL, assigned_team VARCHAR(190) NULL,
 assigned_user_id VARCHAR(64) NULL, assigned_display_name VARCHAR(190) NULL,
 sla_hours DECIMAL(12,2) NULL, started_at VARCHAR(40) NULL, completed_at VARCHAR(40) NULL,
 completed_by_user_id VARCHAR(64) NULL, completed_by_name VARCHAR(190) NULL,
 action_taken TEXT NULL, remarks TEXT NULL, is_current TINYINT(1) NULL,
 allow_return TINYINT(1) NULL, allow_hold TINYINT(1) NULL,
 requires_attachment TINYINT(1) NULL, assignment_source VARCHAR(64) NULL,
 payroll_assignment_source VARCHAR(64) NULL, external_status VARCHAR(64) NULL,
 handoff_owner_user_id VARCHAR(64) NULL, return_receiver_type VARCHAR(32) NULL,
 return_receiver_role VARCHAR(64) NULL, return_receiver_team VARCHAR(190) NULL,
 return_receiver_user_id VARCHAR(64) NULL, expected_turnaround_hours DECIMAL(12,2) NULL,
 source_json LONGTEXT NOT NULL, source_sha256 CHAR(64) NOT NULL,
 PRIMARY KEY (document_id,step_number),
 INDEX idx_instance_status_user (status,assigned_user_id),
 INDEX idx_instance_status_role (status,assigned_role),
 INDEX idx_instance_status_team (status,assigned_team),
 CONSTRAINT fk_instance_document FOREIGN KEY (document_id) REFERENCES documents(id),
 CHECK (JSON_VALID(source_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS document_attachments (
 document_id VARCHAR(190) NOT NULL, attachment_kind VARCHAR(32) NOT NULL, position INT NOT NULL,
 file_id VARCHAR(64) NULL, step_number INT NULL, uploaded_at VARCHAR(40) NULL,
 uploaded_by VARCHAR(190) NULL, file_name VARCHAR(255) NULL, mime_type VARCHAR(120) NULL,
 size_bytes BIGINT NULL, file_exists TINYINT(1) NOT NULL DEFAULT 0,
 source_json LONGTEXT NOT NULL, source_sha256 CHAR(64) NOT NULL,
 PRIMARY KEY (document_id,attachment_kind,position), INDEX idx_attachment_file (file_id),
 CONSTRAINT fk_attachment_document FOREIGN KEY (document_id) REFERENCES documents(id),
 CHECK (JSON_VALID(source_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS document_custody_history (
 document_id VARCHAR(190) NOT NULL, position INT NOT NULL, movement_id VARCHAR(190) NULL,
 movement_type VARCHAR(64) NULL, from_location VARCHAR(190) NULL, to_location VARCHAR(190) NULL,
 movement_at VARCHAR(40) NULL, stage_number INT NULL, purpose TEXT NULL,
 remarks TEXT NULL, actor_id VARCHAR(64) NULL, actor_name VARCHAR(190) NULL,
 representative VARCHAR(190) NULL, source_json LONGTEXT NOT NULL, source_sha256 CHAR(64) NOT NULL,
 PRIMARY KEY (document_id,position), INDEX idx_custody_document_time (document_id,movement_at),
 CONSTRAINT fk_custody_document FOREIGN KEY (document_id) REFERENCES documents(id),
 CHECK (JSON_VALID(source_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
