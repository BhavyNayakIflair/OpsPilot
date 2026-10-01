#!/usr/bin/env bash
set -e

echo "=========================================="
echo "🚀 OpsPilot PostgreSQL Setup Script"
echo "=========================================="

# 1. Ensure PostgreSQL service is active
echo "1. Checking PostgreSQL service..."
if ! pg_isready -q; then
    echo "Starting PostgreSQL service..."
    sudo systemctl start postgresql || sudo service postgresql start
fi

echo "PostgreSQL is running."

# 2. Configure database and user
echo "2. Creating OpsPilot database and user..."
sudo -u postgres psql << 'EOF'
-- Create user opspilot if not exists
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'opspilot') THEN

      CREATE ROLE opspilot WITH LOGIN SUPERUSER PASSWORD 'opspilot_password';
   ELSE
      ALTER ROLE opspilot WITH PASSWORD 'opspilot_password' SUPERUSER;
   END IF;
END
$do$;

-- Also set postgres user password for pgAdmin convenience
ALTER USER postgres WITH PASSWORD 'postgres';

-- Create database opspilot if not exists
SELECT 'CREATE DATABASE opspilot OWNER opspilot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'opspilot')\gexec

GRANT ALL PRIVILEGES ON DATABASE opspilot TO opspilot;
EOF

echo ""
echo "✅ Database 'opspilot' and user 'opspilot' created successfully!"
echo "✅ Superuser 'postgres' password set to 'postgres'."
echo ""
echo "=========================================="
echo "📋 pgAdmin 4 Connection Details:"
echo "------------------------------------------"
echo "• Name: OpsPilot Local DB"
echo "• Host name/address: 127.0.0.1 (or localhost)"
echo "• Port: 5432"
echo "• Maintenance database: opspilot (or postgres)"
echo "• Username: opspilot  (or postgres)"
echo "• Password: opspilot_password  (or postgres)"
echo "=========================================="
