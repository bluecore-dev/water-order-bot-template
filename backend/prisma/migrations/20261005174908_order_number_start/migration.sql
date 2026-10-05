-- Make #1001 the sequence's START value too, so RESTART (e.g. TRUNCATE ... RESTART IDENTITY
-- on a fresh/test database) never falls back to #1.
ALTER SEQUENCE "Order_orderNumber_seq" START WITH 1001;
