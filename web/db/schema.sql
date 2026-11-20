-- GetOnDeal CRM schema (MySQL 8 / MariaDB 10.6+)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  department VARCHAR(100),
  leader_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role ENUM('super_admin','admin','sales_manager','team_leader','calling_executive','sales_executive','marketing_manager','viewer') NOT NULL,
  team_id INT NULL,
  manager_id INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  available TINYINT(1) NOT NULL DEFAULT 1,
  daily_lead_cap INT NOT NULL DEFAULT 50,
  target_calls INT NOT NULL DEFAULT 0,
  target_followups INT NOT NULL DEFAULT 0,
  target_conversions INT NOT NULL DEFAULT 0,
  last_assigned_at DATETIME NULL,
  phone VARCHAR(20) NULL,
  notify_channels VARCHAR(60) NOT NULL DEFAULT '',
  vertical VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  position INT NOT NULL,
  is_won TINYINT(1) NOT NULL DEFAULT 0,
  is_lost TINYINT(1) NOT NULL DEFAULT 0,
  is_qualified TINYINT(1) NOT NULL DEFAULT 0,
  color VARCHAR(20) NOT NULL DEFAULT '#64748b',
  allowed_next VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  type VARCHAR(80),
  channel ENUM('Facebook Ads','Instagram Ads','Google Ads','Influencer Marketing','WhatsApp','Events & Activations','Referrals','Offline Marketing','Other') NOT NULL DEFAULT 'Other',
  meta_campaign_id VARCHAR(64) NULL UNIQUE,
  category VARCHAR(100),
  start_date DATE NULL,
  end_date DATE NULL,
  budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  target_audience VARCHAR(255),
  objective VARCHAR(255),
  owner_id INT NULL,
  status ENUM('draft','active','paused','completed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS spend_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  spend_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  source ENUM('manual','meta') NOT NULL DEFAULT 'manual',
  note VARCHAR(255),
  adset_id VARCHAR(64), adset_name VARCHAR(190),
  ad_id VARCHAR(64), ad_name VARCHAR(190),
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (campaign_id, spend_date),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_code VARCHAR(20) NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  alt_mobile VARCHAR(20),
  email VARCHAR(190),
  business_name VARCHAR(190),
  category VARCHAR(100),
  city VARCHAR(100),
  source VARCHAR(80) NOT NULL DEFAULT 'Manual',
  channel VARCHAR(80),
  campaign_id INT NULL,
  campaign_name VARCHAR(190),
  adset_id VARCHAR(64), adset_name VARCHAR(190),
  ad_id VARCHAR(64), ad_name VARCHAR(190),
  form_name VARCHAR(190),
  meta_lead_id VARCHAR(64) NULL UNIQUE,
  owner_id INT NULL,
  priority VARCHAR(30) NOT NULL DEFAULT 'medium',
  stage_id INT NOT NULL,
  stage_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  remarks TEXT,
  tags VARCHAR(255),
  next_followup_at DATETIME NULL,
  last_contact_at DATETIME NULL,
  total_calls INT NOT NULL DEFAULT 0,
  expected_revenue DECIMAL(14,2) NULL,
  actual_revenue DECIMAL(14,2) NULL,
  lost_reason VARCHAR(255),
  consent TINYINT(1) NOT NULL DEFAULT 1,
  dnd TINYINT(1) NOT NULL DEFAULT 0,
  consent_at DATETIME NULL,
  consent_source VARCHAR(80) NULL,
  comm_pref VARCHAR(60) NULL,
  score INT NOT NULL DEFAULT 0,
  win_prob DECIMAL(5,2) NULL,
  anonymized_at DATETIME NULL,
  in_reactivation TINYINT(1) NOT NULL DEFAULT 0,
  sla_alerted TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY (mobile), KEY (email), KEY (owner_id), KEY (stage_id), KEY (campaign_id),
  KEY (created_at), KEY (next_followup_at), KEY (source), KEY (score), KEY (category), KEY (city), KEY (in_reactivation),
  KEY stage_forecast (stage_id, win_prob, expected_revenue),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_activities (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  user_id INT NULL,
  type VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (lead_id, created_at),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS calls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  user_id INT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  duration_sec INT NOT NULL DEFAULT 0,
  disposition VARCHAR(40) NOT NULL,
  remarks TEXT,
  recording_url VARCHAR(500),
  provider_call_id VARCHAR(80) NULL,
  call_status VARCHAR(30) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (user_id, started_at), KEY (lead_id), KEY (provider_call_id), KEY (started_at),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS followups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  assigned_to INT NULL,
  due_at DATETIME NOT NULL,
  status ENUM('pending','done','cancelled') NOT NULL DEFAULT 'pending',
  note TEXT,
  outcome TEXT,
  reminded TINYINT(1) NOT NULL DEFAULT 0,
  escalated TINYINT(1) NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (assigned_to, status, due_at),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stage_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  from_stage_id INT NULL,
  to_stage_id INT NOT NULL,
  user_id INT NULL,
  seconds_in_prev INT NOT NULL DEFAULT 0,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (lead_id), KEY (from_stage_id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Attribution: each sale is credited once, to one campaign, chosen by the attribution_model setting (first or last touch, see lead_touches).
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  campaign_id INT NULL,
  user_id INT NULL,
  product VARCHAR(190) NOT NULL,
  sale_date DATE NOT NULL,
  order_value DECIMAL(14,2) NOT NULL,
  gross_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  invoice_no VARCHAR(80),
  status ENUM('Pending','Partially Paid','Paid','Refunded','Cancelled') NOT NULL DEFAULT 'Pending',
  attribution VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (sale_date), KEY (campaign_id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  paid_at DATE NOT NULL,
  mode VARCHAR(40) NOT NULL,
  reference_id VARCHAR(120),
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (sale_id), KEY (paid_at),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  link VARCHAR(255),
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (user_id, read_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id VARCHAR(40),
  details TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (entity, entity_id), KEY (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) PRIMARY KEY,
  v TEXT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field ENUM('source','campaign','category') NOT NULL,
  value VARCHAR(190) NOT NULL,
  team_id INT NULL,
  user_id INT NULL,
  position INT NOT NULL DEFAULT 0,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS meta_sync_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  leadgen_id VARCHAR(64),
  status VARCHAR(20) NOT NULL,
  payload TEXT,
  error TEXT,
  attempts INT NOT NULL DEFAULT 1,
  lead_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY (status), KEY (leadgen_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  query VARCHAR(1000) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- Every marketing touch on a lead (creation + re-enquiries). Drives first/last-touch attribution.
CREATE TABLE IF NOT EXISTS lead_touches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  campaign_id INT NULL,
  source VARCHAR(80),
  channel VARCHAR(80),
  adset_name VARCHAR(190),
  ad_name VARCHAR(190),
  touched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (lead_id, touched_at),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Background jobs (bulk imports, large exports). Processed in-process; see src/lib/jobs.ts.
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  payload TEXT,
  result MEDIUMTEXT,
  file_path VARCHAR(255),
  progress INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  error TEXT,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  KEY (status), KEY (created_by)
) ENGINE=InnoDB;

-- Server / integration errors for the monitoring screen.
CREATE TABLE IF NOT EXISTS error_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(60) NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (created_at)
) ENGINE=InnoDB;

-- Outbound/inbound messages: email, WhatsApp, webhook (SMS gateway etc.).
CREATE TABLE IF NOT EXISTS message_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  channel VARCHAR(20) NOT NULL,
  direction VARCHAR(5) NOT NULL DEFAULT 'out',
  to_addr VARCHAR(190),
  lead_id INT NULL,
  user_id INT NULL,
  body TEXT,
  status VARCHAR(20) NOT NULL,
  error TEXT,
  provider_id VARCHAR(120),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (lead_id), KEY (created_at)
) ENGINE=InnoDB;
