-- ──────────────────────────────────────────────────────────────────────────────
-- waggle_hard — stress-test schema for Waggle's NL→SQL pipeline.
-- 50 tables across: HR/Org · CRM · Products · Sales · Subscriptions · Support
--                   · Geography · Audit/Outliers
--
-- Deliberate "abnormalities" to stress the LLM:
--   - Composite primary keys (junction tables)
--   - Self-referential FKs (employees.manager_id, product_categories.parent_id)
--   - JSONB + arrays
--   - NULLs in semantically-required columns
--   - Mixed-case strings ("PAID" / "paid" / "Paid") in one column
--   - One table with PascalCase identifiers ("EventLog")
--   - One table with no FKs at all (orphan_notes)
--   - One denormalized table with embedded text (raw_metrics)
--   - Soft deletes (deleted_at)
--   - Negative + zero values where they shouldn't be
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS audit_log, "EventLog", raw_metrics, orphan_notes,
  ticket_tags, tags, ticket_messages, tickets,
  feature_flags, usage_events, subscription_addons, subscriptions, plans,
  order_discounts, discounts, payments, payment_methods, invoice_lines,
  invoices, order_items, orders,
  supplier_products, suppliers, stock_movements, warehouses, inventory_items,
  product_variants, products, product_categories,
  interactions, opportunities, opportunity_stages, leads,
  account_industries, industries, contacts, accounts,
  attendance_logs, time_off_requests, performance_reviews,
  employee_skills, skills, salary_grades, job_titles, employees, teams, departments,
  addresses, regions, countries
  CASCADE;

-- ── GEOGRAPHY ────────────────────────────────────────────────────────────────

CREATE TABLE countries (
  id          SERIAL PRIMARY KEY,
  iso2        CHAR(2) UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  continent   TEXT
);

CREATE TABLE regions (
  id          SERIAL PRIMARY KEY,
  country_id  INT REFERENCES countries(id),
  name        TEXT NOT NULL,
  code        TEXT
);

CREATE TABLE addresses (
  id           SERIAL PRIMARY KEY,
  line1        TEXT,
  line2        TEXT,
  city         TEXT,
  region_id    INT REFERENCES regions(id),
  country_id   INT REFERENCES countries(id),
  postal_code  TEXT
);

-- ── HR / ORG ─────────────────────────────────────────────────────────────────

CREATE TABLE departments (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  budget  NUMERIC(12,2)
);

CREATE TABLE teams (
  id              SERIAL PRIMARY KEY,
  department_id   INT REFERENCES departments(id),
  name            TEXT NOT NULL,
  created_at      DATE DEFAULT CURRENT_DATE
);

CREATE TABLE job_titles (
  id     SERIAL PRIMARY KEY,
  title  TEXT NOT NULL,
  level  INT
);

CREATE TABLE salary_grades (
  id      SERIAL PRIMARY KEY,
  grade   TEXT NOT NULL,
  min_pay NUMERIC(10,2),
  max_pay NUMERIC(10,2)
);

CREATE TABLE employees (
  id            SERIAL PRIMARY KEY,
  team_id       INT REFERENCES teams(id),
  manager_id    INT REFERENCES employees(id),     -- self-ref
  job_title_id  INT REFERENCES job_titles(id),
  grade_id      INT REFERENCES salary_grades(id),
  address_id    INT REFERENCES addresses(id),
  first_name    TEXT NOT NULL,
  last_name     TEXT,                              -- some NULL
  email         TEXT,                              -- not unique on purpose
  hire_date     DATE,
  termination_date DATE,
  salary        NUMERIC(10,2),
  is_active     BOOLEAN DEFAULT TRUE,
  deleted_at    TIMESTAMP                          -- soft delete
);

CREATE TABLE skills (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  category TEXT
);

CREATE TABLE employee_skills (
  employee_id  INT REFERENCES employees(id),
  skill_id     INT REFERENCES skills(id),
  proficiency  INT,                                -- 1..5
  PRIMARY KEY (employee_id, skill_id)              -- composite PK
);

CREATE TABLE performance_reviews (
  id           SERIAL PRIMARY KEY,
  employee_id  INT REFERENCES employees(id),
  reviewer_id  INT REFERENCES employees(id),
  review_date  DATE,
  score        NUMERIC(3,1),
  comments     TEXT
);

CREATE TABLE time_off_requests (
  id           SERIAL PRIMARY KEY,
  employee_id  INT REFERENCES employees(id),
  start_date   DATE,
  end_date     DATE,
  reason       TEXT,
  status       TEXT                                -- mixed case: 'approved'/'APPROVED'/'Pending'
);

CREATE TABLE attendance_logs (
  id           BIGSERIAL PRIMARY KEY,
  employee_id  INT REFERENCES employees(id),
  clock_in     TIMESTAMP,
  clock_out    TIMESTAMP,
  hours_worked NUMERIC(5,2)
);

-- ── CRM ──────────────────────────────────────────────────────────────────────

CREATE TABLE industries (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE accounts (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_id      INT REFERENCES employees(id),
  address_id    INT REFERENCES addresses(id),
  annual_revenue NUMERIC(14,2),
  employee_count INT,
  created_at    TIMESTAMP DEFAULT NOW(),
  deleted_at    TIMESTAMP
);

CREATE TABLE account_industries (
  account_id   INT REFERENCES accounts(id),
  industry_id  INT REFERENCES industries(id),
  is_primary   BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (account_id, industry_id)            -- composite PK
);

CREATE TABLE contacts (
  id          SERIAL PRIMARY KEY,
  account_id  INT REFERENCES accounts(id),
  first_name  TEXT,
  last_name   TEXT,
  email       TEXT,                                -- duplicates allowed (stress)
  phone       TEXT,
  title       TEXT
);

CREATE TABLE leads (
  id          SERIAL PRIMARY KEY,
  contact_id  INT REFERENCES contacts(id),
  source      TEXT,
  status      TEXT,
  score       INT,
  created_at  TIMESTAMP
);

CREATE TABLE opportunity_stages (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT,
  is_closed   BOOLEAN
);

CREATE TABLE opportunities (
  id           SERIAL PRIMARY KEY,
  account_id   INT REFERENCES accounts(id),
  owner_id     INT REFERENCES employees(id),
  stage_id     INT REFERENCES opportunity_stages(id),
  name         TEXT,
  amount       NUMERIC(12,2),
  expected_close DATE,
  closed_at    DATE,
  is_won       BOOLEAN
);

CREATE TABLE interactions (
  id            SERIAL PRIMARY KEY,
  contact_id    INT REFERENCES contacts(id),
  employee_id   INT REFERENCES employees(id),
  type          TEXT,                              -- 'call','email','meeting'
  occurred_at   TIMESTAMP,
  notes         TEXT
);

-- ── PRODUCTS ─────────────────────────────────────────────────────────────────

CREATE TABLE product_categories (
  id          SERIAL PRIMARY KEY,
  parent_id   INT REFERENCES product_categories(id),  -- self-ref tree
  name        TEXT NOT NULL
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  category_id INT REFERENCES product_categories(id),
  sku         TEXT UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  unit_price  NUMERIC(10,2),
  is_active   BOOLEAN DEFAULT TRUE,
  metadata    JSONB                                -- semi-structured
);

CREATE TABLE product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INT REFERENCES products(id),
  variant_sku TEXT UNIQUE,
  attributes  JSONB,
  price_delta NUMERIC(8,2)
);

CREATE TABLE warehouses (
  id          SERIAL PRIMARY KEY,
  address_id  INT REFERENCES addresses(id),
  name        TEXT,
  capacity    INT
);

CREATE TABLE inventory_items (
  id            SERIAL PRIMARY KEY,
  warehouse_id  INT REFERENCES warehouses(id),
  variant_id    INT REFERENCES product_variants(id),
  quantity      INT,
  reorder_level INT
);

CREATE TABLE stock_movements (
  id              BIGSERIAL PRIMARY KEY,
  inventory_item_id INT REFERENCES inventory_items(id),
  movement_type   TEXT,                            -- 'in','out','adjust'
  quantity        INT,
  occurred_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE suppliers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  address_id  INT REFERENCES addresses(id),
  rating      NUMERIC(2,1)
);

CREATE TABLE supplier_products (
  supplier_id  INT REFERENCES suppliers(id),
  product_id   INT REFERENCES products(id),
  cost         NUMERIC(10,2),
  lead_time_days INT,
  PRIMARY KEY (supplier_id, product_id)            -- composite PK
);

-- ── SALES / ORDERS ───────────────────────────────────────────────────────────

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  account_id  INT REFERENCES accounts(id),
  contact_id  INT REFERENCES contacts(id),
  status      TEXT,                                -- mixed case: 'paid','PAID','Paid','pending'
  ordered_at  TIMESTAMP,
  total       NUMERIC(12,2),
  currency    CHAR(3) DEFAULT 'USD'
);

CREATE TABLE order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INT REFERENCES orders(id) ON DELETE CASCADE,
  variant_id   INT REFERENCES product_variants(id),
  quantity     INT,
  unit_price   NUMERIC(10,2),
  line_total   NUMERIC(12,2)
);

CREATE TABLE invoices (
  id           SERIAL PRIMARY KEY,
  order_id     INT REFERENCES orders(id),
  invoice_no   TEXT UNIQUE,
  issued_at    DATE,
  due_at       DATE,
  status       TEXT,
  total        NUMERIC(12,2)
);

CREATE TABLE invoice_lines (
  id          SERIAL PRIMARY KEY,
  invoice_id  INT REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT,
  amount      NUMERIC(12,2)
);

CREATE TABLE payment_methods (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE                      -- 'card','wire','cash','crypto'
);

CREATE TABLE payments (
  id          SERIAL PRIMARY KEY,
  invoice_id  INT REFERENCES invoices(id),
  method_id   INT REFERENCES payment_methods(id),
  amount      NUMERIC(12,2),                       -- some negative = refund
  paid_at     TIMESTAMP,
  reference   TEXT
);

CREATE TABLE discounts (
  id           SERIAL PRIMARY KEY,
  code         TEXT UNIQUE,
  percentage   NUMERIC(5,2),
  starts_at    DATE,
  ends_at      DATE
);

CREATE TABLE order_discounts (
  order_id     INT REFERENCES orders(id),
  discount_id  INT REFERENCES discounts(id),
  applied_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (order_id, discount_id)              -- composite PK
);

-- ── SUBSCRIPTIONS / SaaS ─────────────────────────────────────────────────────

CREATE TABLE plans (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  monthly_price NUMERIC(10,2),
  is_public    BOOLEAN DEFAULT TRUE
);

CREATE TABLE subscriptions (
  id           SERIAL PRIMARY KEY,
  account_id   INT REFERENCES accounts(id),
  plan_id      INT REFERENCES plans(id),
  started_at   DATE,
  cancelled_at DATE,
  status       TEXT
);

CREATE TABLE subscription_addons (
  subscription_id INT REFERENCES subscriptions(id),
  addon_name      TEXT,
  monthly_price   NUMERIC(8,2),
  PRIMARY KEY (subscription_id, addon_name)        -- composite PK
);

CREATE TABLE usage_events (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id INT REFERENCES subscriptions(id),
  event_name      TEXT,
  attributes      JSONB,
  occurred_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE feature_flags (
  id           SERIAL PRIMARY KEY,
  account_id   INT REFERENCES accounts(id),
  flag_key     TEXT,
  is_enabled   BOOLEAN
);

-- ── SUPPORT ──────────────────────────────────────────────────────────────────

CREATE TABLE tickets (
  id            SERIAL PRIMARY KEY,
  account_id    INT REFERENCES accounts(id),
  contact_id    INT REFERENCES contacts(id),
  assignee_id   INT REFERENCES employees(id),
  subject       TEXT,
  priority      TEXT,
  status        TEXT,
  opened_at     TIMESTAMP,
  closed_at     TIMESTAMP,
  labels        TEXT[]                             -- array column
);

CREATE TABLE ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INT REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   INT REFERENCES employees(id),
  body        TEXT,
  sent_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tags (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE ticket_tags (
  ticket_id  INT REFERENCES tickets(id),
  tag_id     INT REFERENCES tags(id),
  PRIMARY KEY (ticket_id, tag_id)                  -- composite PK
);

-- ── AUDIT / OUTLIERS ─────────────────────────────────────────────────────────

-- Wide table, JSONB payload
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_id      INT REFERENCES employees(id),
  entity_type   TEXT,
  entity_id     INT,
  action        TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  request_id    TEXT,
  payload       JSONB,
  duration_ms   INT,
  status_code   INT,
  occurred_at   TIMESTAMP DEFAULT NOW()
);

-- PascalCase table name + columns — intentional naming inconsistency
CREATE TABLE "EventLog" (
  "Id"          SERIAL PRIMARY KEY,
  "EventType"   TEXT,
  "OccurredAt"  TIMESTAMP DEFAULT NOW(),
  "Severity"    TEXT,
  "Source"      TEXT
);

-- Denormalized — embeds product/account names rather than FKs
CREATE TABLE raw_metrics (
  id              BIGSERIAL PRIMARY KEY,
  product_name    TEXT,                            -- denormalized
  account_name    TEXT,                            -- denormalized
  metric_name     TEXT,
  metric_value    NUMERIC(14,4),
  recorded_at     TIMESTAMP
);

-- No FK relationships at all
CREATE TABLE orphan_notes (
  id          SERIAL PRIMARY KEY,
  author_name TEXT,
  topic       TEXT,
  content     TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- DATA POPULATION
-- ──────────────────────────────────────────────────────────────────────────────

-- Geography (small)
INSERT INTO countries (iso2, name, continent) VALUES
  ('US','United States','North America'),
  ('CA','Canada','North America'),
  ('FR','France','Europe'),
  ('DE','Germany','Europe'),
  ('MA','Morocco','Africa'),
  ('JP','Japan','Asia'),
  ('AU','Australia','Oceania'),
  ('BR','Brazil','South America');

INSERT INTO regions (country_id, name, code)
SELECT (1 + (g % 8)), 'Region ' || g, 'R' || g FROM generate_series(1,40) g;

INSERT INTO addresses (line1, city, region_id, country_id, postal_code)
SELECT
  (g || ' Main St'),
  CASE g % 5 WHEN 0 THEN 'New York' WHEN 1 THEN 'Paris' WHEN 2 THEN 'Tokyo' WHEN 3 THEN 'Casablanca' ELSE 'Berlin' END,
  1 + (g % 40),
  1 + (g % 8),
  LPAD((g*7)::text, 5, '0')
FROM generate_series(1,200) g;

-- Departments / Teams / Titles / Grades
INSERT INTO departments (name, budget) VALUES
  ('Engineering', 5000000), ('Sales', 3000000), ('Marketing', 1500000),
  ('Support', 800000), ('Finance', 1200000), ('HR', 600000),
  ('Operations', 2000000), ('Product', 2500000);

INSERT INTO teams (department_id, name)
SELECT 1 + (g % 8), 'Team ' || g FROM generate_series(1,30) g;

INSERT INTO job_titles (title, level) VALUES
  ('Junior Engineer', 1), ('Senior Engineer', 3), ('Staff Engineer', 5),
  ('Engineering Manager', 4), ('VP Engineering', 6),
  ('Account Executive', 3), ('Sales Manager', 4),
  ('Marketing Specialist', 2), ('CMO', 6),
  ('Support Agent', 2), ('Support Lead', 4),
  ('Accountant', 2), ('CFO', 6),
  ('Recruiter', 2), ('Product Manager', 4);

INSERT INTO salary_grades (grade, min_pay, max_pay) VALUES
  ('G1', 30000, 50000), ('G2', 50000, 80000),
  ('G3', 80000, 120000), ('G4', 120000, 180000),
  ('G5', 180000, 280000), ('G6', 280000, 500000);

-- Employees (300, with self-ref managers)
INSERT INTO employees (team_id, job_title_id, grade_id, address_id, first_name, last_name, email, hire_date, salary, is_active)
SELECT
  1 + (g % 30),
  1 + (g % 15),
  1 + (g % 6),
  1 + (g % 200),
  'First' || g,
  CASE WHEN g % 17 = 0 THEN NULL ELSE 'Last' || g END,
  'employee' || g || '@contoso.test',
  CURRENT_DATE - (g * 17 % 3650),
  40000 + (g * 137 % 200000),
  CASE WHEN g % 13 = 0 THEN FALSE ELSE TRUE END
FROM generate_series(1,300) g;

-- Self-ref managers (employees 1..50 manage everyone else)
UPDATE employees SET manager_id = 1 + (id % 50) WHERE id > 50;
-- Soft-delete a few
UPDATE employees SET deleted_at = NOW() - INTERVAL '90 days', is_active = FALSE
WHERE id IN (7, 42, 99, 150, 250);

-- Skills
INSERT INTO skills (name, category) VALUES
  ('Python', 'tech'), ('SQL', 'tech'), ('Go', 'tech'), ('React', 'tech'),
  ('Negotiation', 'soft'), ('Leadership', 'soft'), ('Public Speaking', 'soft'),
  ('Spanish', 'language'), ('French', 'language'), ('Mandarin', 'language'),
  ('Excel', 'tool'), ('Tableau', 'tool'), ('Salesforce', 'tool');

INSERT INTO employee_skills (employee_id, skill_id, proficiency)
SELECT e, s, 1 + ((e + s) % 5)
FROM generate_series(1,300) e, generate_series(1,13) s
WHERE (e * s) % 7 = 0;

INSERT INTO performance_reviews (employee_id, reviewer_id, review_date, score, comments)
SELECT
  1 + (g % 300),
  1 + ((g * 3) % 50),
  CURRENT_DATE - (g % 720),
  3.0 + ((g * 7) % 30) / 10.0,
  CASE WHEN g % 5 = 0 THEN 'Exceeds expectations' ELSE 'Meets expectations' END
FROM generate_series(1,500) g;

INSERT INTO time_off_requests (employee_id, start_date, end_date, reason, status)
SELECT
  1 + (g % 300),
  CURRENT_DATE - (g % 365),
  CURRENT_DATE - (g % 365) + (1 + g % 10),
  CASE g % 4 WHEN 0 THEN 'Vacation' WHEN 1 THEN 'Sick' WHEN 2 THEN 'Personal' ELSE 'Bereavement' END,
  CASE g % 5 WHEN 0 THEN 'approved' WHEN 1 THEN 'APPROVED' WHEN 2 THEN 'Pending' WHEN 3 THEN 'rejected' ELSE 'Approved' END
FROM generate_series(1,400) g;

INSERT INTO attendance_logs (employee_id, clock_in, clock_out, hours_worked)
SELECT
  1 + (g % 300),
  -- 18 months of working days (skip weekends approximated by *7/5 spread)
  date_trunc('day', NOW() - ((g % 540) || ' days')::interval) + INTERVAL '9 hours',
  date_trunc('day', NOW() - ((g % 540) || ' days')::interval) + INTERVAL '17 hours',
  8 + (g % 3)
FROM generate_series(1,5000) g;

-- CRM
INSERT INTO industries (name) VALUES
  ('Software'), ('Healthcare'), ('Finance'), ('Manufacturing'),
  ('Retail'), ('Education'), ('Government'), ('Energy');

INSERT INTO accounts (name, owner_id, address_id, annual_revenue, employee_count, created_at)
SELECT
  'Account ' || g,
  1 + (g % 300),
  1 + (g % 200),
  100000 + (g * 9173 % 50000000),
  10 + (g * 13 % 5000),
  -- Spread account creation across ~720 days (~24 months) so older accounts exist
  NOW() - ((g * 5 % 720) || ' days')::interval
FROM generate_series(1,150) g;
UPDATE accounts SET deleted_at = NOW() - INTERVAL '30 days' WHERE id IN (5, 23, 88);

INSERT INTO account_industries (account_id, industry_id, is_primary)
SELECT a, i, (i = 1 + (a % 8))
FROM generate_series(1,150) a, generate_series(1,8) i
WHERE (a * i) % 11 = 0;

INSERT INTO contacts (account_id, first_name, last_name, email, phone, title)
SELECT
  1 + (g % 150),
  'Contact' || g,
  CASE WHEN g % 19 = 0 THEN NULL ELSE 'Family' || g END,
  -- duplicates on purpose: every 50th shares same email
  'contact' || (g % 50) || '@external.test',
  '+1-555-' || LPAD((g % 10000)::text, 4, '0'),
  CASE g % 4 WHEN 0 THEN 'CEO' WHEN 1 THEN 'CFO' WHEN 2 THEN 'CTO' ELSE 'VP' END
FROM generate_series(1,500) g;

INSERT INTO leads (contact_id, source, status, score, created_at)
SELECT
  1 + (g % 500),
  CASE g % 5 WHEN 0 THEN 'web' WHEN 1 THEN 'referral' WHEN 2 THEN 'event' WHEN 3 THEN 'cold' ELSE 'partner' END,
  CASE g % 4 WHEN 0 THEN 'new' WHEN 1 THEN 'qualified' WHEN 2 THEN 'lost' ELSE 'won' END,
  10 + (g * 7 % 90),
  NOW() - ((g * 2 % 540) || ' days')::interval
FROM generate_series(1,300) g;

INSERT INTO opportunity_stages (name, sort_order, is_closed) VALUES
  ('Prospect', 1, FALSE), ('Qualification', 2, FALSE), ('Proposal', 3, FALSE),
  ('Negotiation', 4, FALSE), ('Closed Won', 5, TRUE), ('Closed Lost', 6, TRUE);

INSERT INTO opportunities (account_id, owner_id, stage_id, name, amount, expected_close, closed_at, is_won)
SELECT
  1 + (g % 150),
  1 + (g % 300),
  1 + (g % 6),
  'Opp #' || g,
  5000 + (g * 311 % 500000),
  CURRENT_DATE + (g % 180 - 90),
  CASE WHEN (g % 6) IN (4, 5) THEN CURRENT_DATE - (g % 200) ELSE NULL END,
  CASE WHEN g % 6 = 4 THEN TRUE WHEN g % 6 = 5 THEN FALSE ELSE NULL END
FROM generate_series(1,400) g;

INSERT INTO interactions (contact_id, employee_id, type, occurred_at, notes)
SELECT
  1 + (g % 500),
  1 + (g % 300),
  CASE g % 3 WHEN 0 THEN 'call' WHEN 1 THEN 'email' ELSE 'meeting' END,
  -- Spread across 540 days
  NOW() - ((g % 540) || ' days')::interval - ((g % 24) || ' hours')::interval,
  'Discussed item ' || g
FROM generate_series(1,3000) g;

-- Products
INSERT INTO product_categories (parent_id, name) VALUES
  (NULL, 'Hardware'), (NULL, 'Software'), (NULL, 'Services');
INSERT INTO product_categories (parent_id, name)
SELECT 1 + (g % 3), 'Subcat ' || g FROM generate_series(1,12) g;

INSERT INTO products (category_id, sku, name, description, unit_price, is_active, metadata)
SELECT
  1 + (g % 15),
  'SKU-' || LPAD(g::text, 5, '0'),
  'Product ' || g,
  CASE WHEN g % 23 = 0 THEN NULL ELSE 'Description for product ' || g END,
  10 + (g * 17 % 5000),
  CASE WHEN g % 11 = 0 THEN FALSE ELSE TRUE END,
  jsonb_build_object('weight_kg', (g % 20) + 0.5, 'color', CASE g % 3 WHEN 0 THEN 'red' WHEN 1 THEN 'blue' ELSE 'green' END)
FROM generate_series(1,100) g;

INSERT INTO product_variants (product_id, variant_sku, attributes, price_delta)
SELECT
  1 + (g % 100),
  'VAR-' || LPAD(g::text, 5, '0'),
  jsonb_build_object('size', CASE g % 4 WHEN 0 THEN 'S' WHEN 1 THEN 'M' WHEN 2 THEN 'L' ELSE 'XL' END),
  ((g % 20) - 10) * 1.5
FROM generate_series(1,300) g;

INSERT INTO warehouses (address_id, name, capacity)
SELECT 1 + (g % 200), 'Warehouse ' || g, 1000 + (g * 37 % 50000) FROM generate_series(1,15) g;

INSERT INTO inventory_items (warehouse_id, variant_id, quantity, reorder_level)
SELECT 1 + (g % 15), 1 + (g % 300), g * 3 % 1000, 50 FROM generate_series(1,500) g;

INSERT INTO stock_movements (inventory_item_id, movement_type, quantity, occurred_at)
SELECT
  1 + (g % 500),
  CASE g % 3 WHEN 0 THEN 'in' WHEN 1 THEN 'out' ELSE 'adjust' END,
  (g % 100) - 50,
  NOW() - ((g % 540) || ' days')::interval - ((g * 7 % 24) || ' hours')::interval
FROM generate_series(1,8000) g;

INSERT INTO suppliers (name, address_id, rating)
SELECT 'Supplier ' || g, 1 + (g % 200), 1.0 + (g % 40) / 10.0 FROM generate_series(1,40) g;

INSERT INTO supplier_products (supplier_id, product_id, cost, lead_time_days)
SELECT s, p, 5 + (s * p % 1000), 1 + (s + p) % 30
FROM generate_series(1,40) s, generate_series(1,100) p
WHERE (s * p) % 13 = 0;

-- Sales / Orders
INSERT INTO orders (account_id, contact_id, status, ordered_at, total, currency)
SELECT
  1 + (g % 150),
  1 + (g % 500),
  CASE g % 7 WHEN 0 THEN 'paid' WHEN 1 THEN 'PAID' WHEN 2 THEN 'Paid'
            WHEN 3 THEN 'pending' WHEN 4 THEN 'cancelled' WHEN 5 THEN 'refunded' ELSE 'paid' END,
  -- Spread orders across the last 540 days (~18 months) with hour-of-day variance
  NOW() - ((g % 540) || ' days')::interval - ((g * 7 % 24) || ' hours')::interval,
  100 + (g * 53 % 10000),
  CASE g % 4 WHEN 0 THEN 'EUR' WHEN 1 THEN 'GBP' ELSE 'USD' END
FROM generate_series(1,5400) g;  -- ~10 orders/day on average

INSERT INTO order_items (order_id, variant_id, quantity, unit_price, line_total)
SELECT
  1 + (g % 5400),
  1 + (g % 300),
  1 + (g % 10),
  10 + (g * 11 % 500),
  (1 + (g % 10)) * (10 + (g * 11 % 500))
FROM generate_series(1,15000) g;

INSERT INTO invoices (order_id, invoice_no, issued_at, due_at, status, total)
SELECT
  g,
  'INV-' || LPAD(g::text, 6, '0'),
  -- Issued same day as the order
  (NOW() - ((g % 540) || ' days')::interval)::date,
  (NOW() - ((g % 540) || ' days')::interval)::date + 30,
  CASE g % 3 WHEN 0 THEN 'paid' WHEN 1 THEN 'open' ELSE 'overdue' END,
  100 + (g * 53 % 10000)
FROM generate_series(1,5400) g;

INSERT INTO invoice_lines (invoice_id, description, amount)
SELECT 1 + (g % 5400), 'Line ' || g, 50 + (g * 7 % 2000) FROM generate_series(1,12000) g;

INSERT INTO payment_methods (name) VALUES ('card'), ('wire'), ('cash'), ('crypto');

INSERT INTO payments (invoice_id, method_id, amount, paid_at, reference)
SELECT
  1 + (g % 5400),
  1 + (g % 4),
  CASE WHEN g % 50 = 0 THEN -((g * 13) % 500)  -- intentional refunds (negative)
       ELSE (g * 13) % 5000 END,
  NOW() - ((g % 540) || ' days')::interval,
  'TXN-' || g
FROM generate_series(1,6500) g;

INSERT INTO discounts (code, percentage, starts_at, ends_at)
SELECT 'PROMO' || g, 5 + (g * 2 % 30), CURRENT_DATE - 60, CURRENT_DATE + 60 FROM generate_series(1,20) g;

INSERT INTO order_discounts (order_id, discount_id)
SELECT o, d FROM generate_series(1,5400) o, generate_series(1,20) d WHERE (o + d) % 71 = 0;

-- Subscriptions
INSERT INTO plans (name, monthly_price, is_public) VALUES
  ('Free', 0, TRUE), ('Starter', 29, TRUE), ('Pro', 99, TRUE),
  ('Business', 299, TRUE), ('Enterprise', 999, FALSE);

INSERT INTO subscriptions (account_id, plan_id, started_at, cancelled_at, status)
SELECT
  1 + (g % 150),
  1 + (g % 5),
  CURRENT_DATE - (g * 5 % 720),
  -- Cancellations are spread over 540 days, not just last 100
  CASE WHEN g % 9 = 0 THEN CURRENT_DATE - ((g * 3) % 540) ELSE NULL END,
  CASE WHEN g % 9 = 0 THEN 'cancelled' ELSE 'active' END
FROM generate_series(1,250) g;

INSERT INTO subscription_addons (subscription_id, addon_name, monthly_price)
SELECT s, 'addon_' || (s % 7), 5 + (s % 50)
FROM generate_series(1,250) s WHERE s % 3 = 0;

INSERT INTO usage_events (subscription_id, event_name, attributes, occurred_at)
SELECT
  1 + (g % 250),
  CASE g % 4 WHEN 0 THEN 'login' WHEN 1 THEN 'api_call' WHEN 2 THEN 'export' ELSE 'view' END,
  jsonb_build_object('value', g % 100, 'tier', CASE g % 3 WHEN 0 THEN 'low' WHEN 1 THEN 'mid' ELSE 'high' END),
  -- 540 days of usage, ~70/day on average
  NOW() - ((g % 540) || ' days')::interval - ((g * 13 % 1440) || ' minutes')::interval
FROM generate_series(1,38000) g;

INSERT INTO feature_flags (account_id, flag_key, is_enabled)
SELECT 1 + (g % 150), 'flag_' || (g % 12), (g % 2 = 0) FROM generate_series(1,300) g;

-- Support
INSERT INTO tickets (account_id, contact_id, assignee_id, subject, priority, status, opened_at, closed_at, labels)
SELECT
  1 + (g % 150),
  1 + (g % 500),
  1 + (g % 300),
  'Ticket #' || g,
  CASE g % 4 WHEN 0 THEN 'low' WHEN 1 THEN 'medium' WHEN 2 THEN 'high' ELSE 'urgent' END,
  CASE g % 5 WHEN 0 THEN 'open' WHEN 1 THEN 'in_progress' WHEN 2 THEN 'waiting' WHEN 3 THEN 'resolved' ELSE 'closed' END,
  -- 540 days of tickets
  NOW() - ((g % 540) || ' days')::interval - ((g * 5 % 24) || ' hours')::interval,
  CASE WHEN g % 3 = 0
       THEN NOW() - ((g % 540) || ' days')::interval + (((g % 72) + 1) || ' hours')::interval
       ELSE NULL END,
  ARRAY['bug', 'urgent']::TEXT[]
FROM generate_series(1,2400) g;

INSERT INTO ticket_messages (ticket_id, author_id, body, sent_at)
SELECT
  1 + (g % 2400),
  1 + (g % 300),
  'Reply ' || g,
  NOW() - ((g % 540) || ' days')::interval - ((g * 11 % 1440) || ' minutes')::interval
FROM generate_series(1,8000) g;

INSERT INTO tags (name) VALUES ('bug'), ('feature'), ('question'), ('urgent'), ('billing'), ('account'), ('api'), ('docs');
INSERT INTO ticket_tags (ticket_id, tag_id)
SELECT t, g FROM generate_series(1,2400) t, generate_series(1,8) g WHERE (t + g) % 17 = 0;

-- Audit / Outliers
INSERT INTO audit_log (actor_id, entity_type, entity_id, action, ip_address, user_agent, request_id, payload, duration_ms, status_code, occurred_at)
SELECT
  1 + (g % 300),
  CASE g % 5 WHEN 0 THEN 'order' WHEN 1 THEN 'invoice' WHEN 2 THEN 'account' WHEN 3 THEN 'employee' ELSE 'subscription' END,
  1 + (g % 1000),
  CASE g % 4 WHEN 0 THEN 'create' WHEN 1 THEN 'update' WHEN 2 THEN 'delete' ELSE 'view' END,
  '10.0.' || (g % 256) || '.' || ((g * 3) % 256),
  CASE g % 3 WHEN 0 THEN 'curl/8.0' WHEN 1 THEN 'Mozilla/5.0' ELSE 'Python/3.11' END,
  'req-' || g,
  jsonb_build_object('before', g, 'after', g + 1, 'changed_fields', ARRAY['name','email']),
  10 + (g * 7 % 2000),
  CASE g % 10 WHEN 0 THEN 500 WHEN 1 THEN 404 WHEN 2 THEN 401 ELSE 200 END,
  NOW() - ((g % 540) || ' days')::interval - ((g * 11 % 1440) || ' minutes')::interval
FROM generate_series(1,18000) g;

INSERT INTO "EventLog" ("EventType", "OccurredAt", "Severity", "Source")
SELECT
  CASE g % 4 WHEN 0 THEN 'login_failed' WHEN 1 THEN 'cron_run' WHEN 2 THEN 'cache_miss' ELSE 'rate_limited' END,
  NOW() - ((g % 540) || ' days')::interval - ((g * 13 % 1440) || ' minutes')::interval,
  CASE g % 3 WHEN 0 THEN 'INFO' WHEN 1 THEN 'WARN' ELSE 'ERROR' END,
  'svc-' || (g % 12)
FROM generate_series(1,8000) g;

INSERT INTO raw_metrics (product_name, account_name, metric_name, metric_value, recorded_at)
SELECT
  'Product ' || (1 + (g % 100)),
  'Account ' || (1 + (g % 150)),
  CASE g % 4 WHEN 0 THEN 'mrr' WHEN 1 THEN 'arr' WHEN 2 THEN 'usage' ELSE 'churn' END,
  (g * 137 % 100000) / 100.0,
  NOW() - ((g % 540) || ' days')::interval - ((g * 17 % 24) || ' hours')::interval
FROM generate_series(1,10000) g;

INSERT INTO orphan_notes (author_name, topic, content)
SELECT 'Author ' || (g % 20), 'Topic ' || (g % 10), 'Note body number ' || g FROM generate_series(1,200) g;

ANALYZE;
