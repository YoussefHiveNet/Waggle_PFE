-- ──────────────────────────────────────────────────────────────────────────────
-- waggle_nyc — BeanBridge Coffee, New York City store
-- Medium-sized seed: ~4,700 rows · 7 tables · Jan–Jun 2025
--
-- Cross-source join: products.sku matches waggle_nj.products.sku
-- Run: createdb waggle_nyc && psql waggle_nyc < seed_nyc.sql
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS returns, order_items, orders, promotions,
  customers, staff, products, categories CASCADE;

-- ── CATEGORIES ────────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT
);

INSERT INTO categories (name, description) VALUES
  ('Espresso Drinks',  'All espresso-based hot and iced beverages'),
  ('Cold Brew & Iced', 'Cold brew, nitro, and iced coffee drinks'),
  ('Tea & Matcha',     'Hot and iced teas, matcha lattes'),
  ('Bakery',           'Fresh-baked pastries, muffins, and breads'),
  ('Sandwiches & Wraps','Hot and cold savory options'),
  ('Retail Beans',     'Whole bean and ground coffee for home brewing'),
  ('Merchandise',      'Mugs, tumblers, and BeanBridge branded items'),
  ('Seasonal Specials','Limited time and holiday offerings');

-- ── PRODUCTS (48 items, SKUs BB-001…BB-048) ──────────────────────────────────

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category_id INT NOT NULL REFERENCES categories(id),
  price       NUMERIC(6,2) NOT NULL,
  cost        NUMERIC(6,2) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO products (sku, name, category_id, price, cost) VALUES
  ('BB-001','Espresso Shot',           1, 2.50, 0.45),
  ('BB-002','Americano',               1, 3.75, 0.55),
  ('BB-003','Cappuccino',              1, 5.00, 0.90),
  ('BB-004','Latte',                   1, 5.50, 1.00),
  ('BB-005','Flat White',              1, 5.25, 0.95),
  ('BB-006','Cortado',                 1, 4.50, 0.80),
  ('BB-007','Macchiato',               1, 4.75, 0.85),
  ('BB-008','Mocha',                   1, 6.00, 1.20),
  ('BB-009','Oat Milk Latte',          1, 6.50, 1.40),
  ('BB-010','Vanilla Latte',           1, 6.25, 1.30),
  ('BB-011','Cold Brew 12oz',          2, 5.00, 0.70),
  ('BB-012','Nitro Cold Brew',         2, 6.00, 0.90),
  ('BB-013','Iced Americano',          2, 4.25, 0.65),
  ('BB-014','Iced Latte',              2, 5.75, 1.10),
  ('BB-015','Iced Matcha Latte',       3, 6.25, 1.50),
  ('BB-016','Cold Brew Float',         2, 7.00, 1.20),
  ('BB-017','Matcha Latte',            3, 5.75, 1.40),
  ('BB-018','Chai Latte',              3, 5.50, 1.10),
  ('BB-019','Earl Grey Tea',           3, 3.50, 0.30),
  ('BB-020','London Fog',              3, 5.25, 1.00),
  ('BB-021','Croissant',               4, 4.25, 1.20),
  ('BB-022','Almond Croissant',        4, 4.75, 1.50),
  ('BB-023','Blueberry Muffin',        4, 3.75, 0.90),
  ('BB-024','Banana Bread Slice',      4, 4.00, 1.00),
  ('BB-025','Avocado Toast',           4, 8.50, 2.80),
  ('BB-026','Cinnamon Roll',           4, 4.50, 1.30),
  ('BB-027','Chocolate Brownie',       4, 3.50, 0.85),
  ('BB-028','Bagel with Cream Cheese', 4, 5.00, 1.60),
  ('BB-029','Turkey & Brie Sandwich',  5,12.50, 4.50),
  ('BB-030','Veggie Wrap',             5,11.00, 3.80),
  ('BB-031','BLT Sandwich',            5,11.50, 4.00),
  ('BB-032','Egg & Cheese Sandwich',   5, 9.50, 3.20),
  ('BB-033','Chicken Pesto Panini',    5,13.00, 4.80),
  ('BB-034','House Blend 250g',        6,16.00, 5.50),
  ('BB-035','Ethiopia Yirgacheffe 250g',6,19.00,7.00),
  ('BB-036','Guatemala Antigua 250g',  6,17.50, 6.00),
  ('BB-037','Dark Roast Espresso 250g',6,16.50, 5.80),
  ('BB-038','Decaf Blend 250g',        6,17.00, 6.20),
  ('BB-039','BeanBridge Mug 12oz',     7,18.00, 4.00),
  ('BB-040','BeanBridge Tumbler 16oz', 7,28.00, 7.00),
  ('BB-041','BeanBridge Tote Bag',     7,22.00, 5.50),
  ('BB-042','Travel Press',            7,35.00,11.00),
  ('BB-043','Pumpkin Spice Latte',     8, 6.75, 1.60),
  ('BB-044','Peppermint Mocha',        8, 7.00, 1.70),
  ('BB-045','Lavender Latte',          8, 6.50, 1.55),
  ('BB-046','Honey Oat Latte',         8, 6.25, 1.45),
  ('BB-047','Strawberry Matcha',       8, 6.75, 1.65),
  ('BB-048','Brown Sugar Cold Brew',   8, 6.50, 1.40);

-- ── STAFF ─────────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  hourly_rate NUMERIC(5,2) NOT NULL,
  hire_date   DATE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO staff (name, role, hourly_rate, hire_date) VALUES
  ('Marcus Rivera',  'Manager',   28.00, '2022-03-15'),
  ('Aisha Thompson', 'Barista',   18.50, '2022-06-01'),
  ('Jake Okonkwo',   'Barista',   17.75, '2023-01-10'),
  ('Sofia Delgado',  'Barista',   17.75, '2023-04-22'),
  ('Leo Nakamura',   'Barista',   18.00, '2023-07-05'),
  ('Priya Mehta',    'Shift Lead',21.00, '2022-11-14'),
  ('Carlos Reyes',   'Barista',   17.50, '2024-02-08'),
  ('Mia Johnson',    'Barista',   17.50, '2024-03-19'),
  ('Daniel Park',    'Barista',   17.75, '2024-05-01'),
  ('Nina Osei',      'Shift Lead',21.50, '2023-09-12'),
  ('Tyler Brooks',   'Barista',   17.50, '2024-06-15'),
  ('Emma Walsh',     'Barista',   17.50, '2024-08-20'),
  ('James Alvarez',  'Barista',   18.00, '2023-12-03'),
  ('Zoe Kim',        'Barista',   17.75, '2024-01-17'),
  ('Rashid Okafor',  'Manager',   27.50, '2022-05-09');

-- ── CUSTOMERS (400 rows) ──────────────────────────────────────────────────────

CREATE TABLE customers (
  id           SERIAL PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  loyalty_pts  INT NOT NULL DEFAULT 0,
  joined_at    TIMESTAMPTZ NOT NULL,
  neighborhood TEXT
);

INSERT INTO customers (first_name, last_name, email, phone, loyalty_pts, joined_at, neighborhood)
SELECT
  (ARRAY['James','Maria','David','Sarah','Michael','Emily','Robert','Jessica',
         'William','Ashley','Daniel','Amanda','Matthew','Melissa','Anthony',
         'Stephanie','Mark','Rebecca','Donald','Sharon','Steven','Laura',
         'Paul','Cynthia','Andrew','Kathleen','Joshua','Angela','Kevin','Deborah',
         'Brian','Rachel','George','Carolyn','Timothy','Janet','Ronald','Catherine',
         'Edward','Frances','Jason','Ann','Jeffrey','Joyce','Ryan','Alice',
         'Jacob','Jean','Gary','Diane','Nicholas','Julie','Eric','Heather',
         'Jonathan','Teresa','Stephen','Gloria','Larry','Evelyn','Justin','Judith',
         'Scott','Martha','Brandon','Amy','Frank','Brenda','Benjamin','Anna',
         'Raymond','Pamela','Gregory','Emma','Samuel','Nicole','Patrick','Helen',
         'Alexander','Samantha','Jack','Christine','Dennis','Debra','Jerry','Virginia',
         'Tyler','Katherine','Aaron','Shirley','Jose','Jacqueline','Adam','Carol',
         'Nathan','Megan','Henry','Christina','Lisa','Charles'])[(gs % 100) + 1]  AS first_name,
  (ARRAY['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
         'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
         'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
         'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
         'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen',
         'Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera',
         'Campbell','Mitchell','Carter','Roberts','Chen','Patel','Kim','Okafor',
         'Osei','Nakamura','Delgado','Reyes','Mehta','Park','Alvarez','Brooks',
         'Walsh','Okonkwo','Coleman','Reed','Murphy','Bailey','Bell','Cooper',
         'Richardson','Cox','Howard','Ward','Peterson','Gray','James','Watson',
         'Barnes','Griffin','Cook','Morgan','Butler','Simmons','Foster','Bryant',
         'Alexander','Russell','Diaz','Hayes','Myers','Ford','Graham','Sullivan',
         'Wallace','Woods','West','Cole','Jordan','Owens','Reynolds','Fisher'])[(gs % 100) + 1] AS last_name,
  lower((ARRAY['james','maria','david','sarah','michael','emily','robert','jessica',
               'william','ashley','daniel','amanda','matthew','melissa','anthony',
               'stephanie','mark','rebecca','donald','sharon','steven','laura',
               'paul','cynthia','andrew','kathleen','joshua','angela','kevin','deborah',
               'brian','rachel','george','carolyn','timothy','janet','ronald','catherine',
               'edward','frances','jason','ann','jeffrey','joyce','ryan','alice',
               'jacob','jean','gary','diane','nicholas','julie','eric','heather',
               'jonathan','teresa','stephen','gloria','larry','evelyn','justin','judith',
               'scott','martha','brandon','amy','frank','brenda','benjamin','anna',
               'raymond','pamela','gregory','emma','samuel','nicole','patrick','helen',
               'alexander','samantha','jack','christine','dennis','debra','jerry','virginia',
               'tyler','katherine','aaron','shirley','jose','jacqueline','adam','carol',
               'nathan','megan','henry','christina','lisa','charles'])[(gs % 100) + 1])
    || '.' ||
  lower((ARRAY['smith','johnson','williams','brown','jones','garcia','miller','davis',
               'rodriguez','martinez','hernandez','lopez','gonzalez','wilson','anderson',
               'thomas','taylor','moore','jackson','martin','lee','perez','thompson',
               'white','harris','sanchez','clark','ramirez','lewis','robinson',
               'walker','young','allen','king','wright','scott','torres','nguyen',
               'hill','flores','green','adams','nelson','baker','hall','rivera',
               'campbell','mitchell','carter','roberts','chen','patel','kim','okafor',
               'osei','nakamura','delgado','reyes','mehta','park','alvarez','brooks',
               'walsh','okonkwo','coleman','reed','murphy','bailey','bell','cooper',
               'richardson','cox','howard','ward','peterson','gray','james','watson',
               'barnes','griffin','cook','morgan','butler','simmons','foster','bryant',
               'alexander','russell','diaz','hayes','myers','ford','graham','sullivan',
               'wallace','woods','west','cole','jordan','owens','reynolds','fisher'])[(gs % 100) + 1])
    || gs || '@email.com'                                                       AS email,
  '212-' || lpad((gs * 7 % 900 + 100)::text, 3, '0') || '-'
         || lpad((gs * 13 % 9000 + 1000)::text, 4, '0')                       AS phone,
  (gs * 17 % 500)                                                               AS loyalty_pts,
  '2024-01-01'::timestamptz + ((gs % 365) || ' days')::interval                AS joined_at,
  (ARRAY['SoHo','Midtown','Upper West Side','Brooklyn Heights','Williamsburg',
         'Astoria','Greenwich Village','Chelsea','Tribeca','Upper East Side',
         'Hell Kitchen','Park Slope','Harlem','Lower East Side','Bushwick'])[(gs % 15) + 1] AS neighborhood
FROM generate_series(1, 400) gs;

-- ── PROMOTIONS ────────────────────────────────────────────────────────────────

CREATE TABLE promotions (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL,
  discount_pct NUMERIC(4,2) NOT NULL,
  valid_from   DATE NOT NULL,
  valid_until  DATE NOT NULL,
  uses_limit   INT,
  uses_count   INT NOT NULL DEFAULT 0
);

INSERT INTO promotions (code, description, discount_pct, valid_from, valid_until, uses_limit) VALUES
  ('WELCOME10', 'New customer 10% off',    10.00,'2025-01-01','2025-12-31', 500),
  ('LOYALTY15', 'Loyalty member 15% off',  15.00,'2025-01-01','2025-12-31', NULL),
  ('MORNING20', '20% off before 9am',      20.00,'2025-01-01','2025-06-30', NULL),
  ('BOGO50',    'Buy one get one 50% off', 50.00,'2025-02-01','2025-03-31', 300),
  ('SPRING15',  'Spring celebration 15%',  15.00,'2025-03-20','2025-05-01', 1000),
  ('SUMMER10',  'Summer kickoff 10% off',  10.00,'2025-06-01','2025-08-31', NULL),
  ('STAFF20',   'Staff discount',          20.00,'2025-01-01','2025-12-31', NULL),
  ('BIRTHDAY15','Birthday month 15% off',  15.00,'2025-01-01','2025-12-31', NULL);

-- ── ORDERS (~1,200 rows, Jan–Jun 2025) ───────────────────────────────────────

CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INT REFERENCES customers(id),
  staff_id     INT NOT NULL REFERENCES staff(id),
  promotion_id INT REFERENCES promotions(id),
  order_total  NUMERIC(8,2) NOT NULL,
  discount_amt NUMERIC(6,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'completed',
  channel      TEXT NOT NULL DEFAULT 'in_store',
  ordered_at   TIMESTAMPTZ NOT NULL
);

INSERT INTO orders (customer_id, staff_id, promotion_id, order_total, discount_amt, status, channel, ordered_at)
SELECT
  CASE WHEN gs % 5 = 0 THEN NULL ELSE (gs % 400) + 1 END,
  (gs % 15) + 1,
  CASE WHEN gs % 12 = 0 THEN (gs % 8) + 1 ELSE NULL END,
  ROUND((6.50 + (gs % 28) * 0.80)::numeric, 2),
  CASE WHEN gs % 12 = 0 THEN ROUND(((gs % 28) * 0.12)::numeric, 2) ELSE 0 END,
  CASE WHEN gs % 40 = 0 THEN 'refunded'
       WHEN gs % 25 = 0 THEN 'cancelled'
       ELSE 'completed' END,
  CASE WHEN gs % 8 = 0 THEN 'online' ELSE 'in_store' END,
  '2025-01-01 07:00:00'::timestamptz
    + ((gs / 7) || ' days')::interval
    + ((gs % 720) || ' minutes')::interval
FROM generate_series(1, 1200) gs;

-- ── ORDER ITEMS (~3,000 rows) ─────────────────────────────────────────────────

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(6,2) NOT NULL,
  subtotal   NUMERIC(8,2) NOT NULL
);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
SELECT
  o.id,
  ((o.id * p.rn * 7 + p.rn * 13) % 48) + 1,
  CASE WHEN (o.id + p.rn) % 7 = 0 THEN 2 ELSE 1 END,
  pr.price,
  ROUND((CASE WHEN (o.id + p.rn) % 7 = 0 THEN 2 ELSE 1 END * pr.price)::numeric, 2)
FROM orders o
CROSS JOIN (SELECT generate_series AS rn FROM generate_series(1, 3)) p
JOIN products pr ON pr.id = ((o.id * p.rn * 7 + p.rn * 13) % 48) + 1
WHERE p.rn <= CASE
  WHEN o.id % 5 = 0 THEN 1
  WHEN o.id % 3 = 0 THEN 2
  ELSE 3
END;

-- ── RETURNS ───────────────────────────────────────────────────────────────────

CREATE TABLE returns (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id),
  product_id  INT NOT NULL REFERENCES products(id),
  reason      TEXT NOT NULL,
  refund_amt  NUMERIC(6,2) NOT NULL,
  returned_at TIMESTAMPTZ NOT NULL
);

INSERT INTO returns (order_id, product_id, reason, refund_amt, returned_at)
SELECT
  o.id,
  ((o.id * 11) % 48) + 1,
  (ARRAY['Wrong order','Quality issue','Allergy concern','Changed mind','Duplicate charge'])[(o.id % 5) + 1],
  ROUND((o.order_total * 0.8)::numeric, 2),
  o.ordered_at + interval '2 hours'
FROM orders o
WHERE o.status = 'refunded';

-- ── SUMMARY ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'waggle_nyc seeded:';
  RAISE NOTICE '  categories:  %', (SELECT count(*) FROM categories);
  RAISE NOTICE '  products:    %', (SELECT count(*) FROM products);
  RAISE NOTICE '  staff:       %', (SELECT count(*) FROM staff);
  RAISE NOTICE '  customers:   %', (SELECT count(*) FROM customers);
  RAISE NOTICE '  promotions:  %', (SELECT count(*) FROM promotions);
  RAISE NOTICE '  orders:      %', (SELECT count(*) FROM orders);
  RAISE NOTICE '  order_items: %', (SELECT count(*) FROM order_items);
  RAISE NOTICE '  returns:     %', (SELECT count(*) FROM returns);
END $$;
