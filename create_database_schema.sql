-- Care Co-Ordinator System Database Schema
-- MySQL Database Setup Script

-- Create database (uncomment if needed)
-- CREATE DATABASE IF NOT EXISTS rtmdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE rtmdb;

-- ============================================
-- CORE TABLES
-- ============================================

-- Facility table - Healthcare facilities
CREATE TABLE IF NOT EXISTS facility (
    facility_id INT AUTO_INCREMENT PRIMARY KEY,
    facility_name VARCHAR(200) NOT NULL,
    facility_email VARCHAR(100),
    facility_address TEXT,
    facility_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Physician table - Physician information
CREATE TABLE IF NOT EXISTS physician (
    physician_id INT AUTO_INCREMENT PRIMARY KEY,
    physician_first_name VARCHAR(100) NOT NULL,
    physician_last_name VARCHAR(100) NOT NULL,
    physician_email VARCHAR(100),
    physician_phone VARCHAR(20),
    physician_specialty VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin table - Administrator accounts
CREATE TABLE IF NOT EXISTS admin (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_first_name VARCHAR(100) NOT NULL,
    admin_last_name VARCHAR(100) NOT NULL,
    admin_email VARCHAR(100) UNIQUE NOT NULL,
    admin_password VARCHAR(255) NOT NULL,
    admin_role ENUM('admin', 'supervisor') DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Patient table - Patient information
CREATE TABLE IF NOT EXISTS patient (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_first_name VARCHAR(100) NOT NULL,
    patient_last_name VARCHAR(100) NOT NULL,
    patient_dob DATE,
    patient_gender ENUM('Male', 'Female', 'Other'),
    patient_room VARCHAR(20),
    patient_admission_date DATE,
    patient_insurance VARCHAR(100),
    facility_id INT,
    physician_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (facility_id) REFERENCES facility(facility_id) ON DELETE SET NULL,
    FOREIGN KEY (physician_id) REFERENCES physician(physician_id) ON DELETE SET NULL,
    INDEX idx_facility (facility_id),
    INDEX idx_physician (physician_id),
    INDEX idx_name (patient_last_name, patient_first_name)
);

-- ============================================
-- CLINICAL DATA TABLES
-- ============================================

-- Vitals data table - Patient vital signs
CREATE TABLE IF NOT EXISTS vitals_data (
    vitals_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    blood_pressure VARCHAR(20),
    heart_rate INT,
    temperature DECIMAL(4,1),
    weight DECIMAL(5,1),
    height DECIMAL(5,1),
    BMI DECIMAL(4,1),
    spo2 INT,
    vitals_date_time DATETIME NOT NULL,
    recorded_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patient(patient_id) ON DELETE CASCADE,
    INDEX idx_patient_datetime (patient_id, vitals_date_time),
    INDEX idx_datetime (vitals_date_time)
);

-- Lab result table - Laboratory test results
CREATE TABLE IF NOT EXISTS lab_result (
    lab_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    sodium DECIMAL(5,2),
    potassium DECIMAL(5,2),
    BUN DECIMAL(5,1),
    creatinine DECIMAL(4,2),
    glucose DECIMAL(5,1),
    lab_date_time DATETIME NOT NULL,
    lab_technician VARCHAR(100),
    lab_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patient(patient_id) ON DELETE CASCADE,
    INDEX idx_patient_datetime (patient_id, lab_date_time),
    INDEX idx_datetime (lab_date_time)
);

-- Medication table - Medication records
CREATE TABLE IF NOT EXISTS medication (
    medication_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    medication_name VARCHAR(200) NOT NULL,
    medication_dose VARCHAR(100),
    medication_frequency VARCHAR(100),
    medication_route VARCHAR(50),
    medication_date_time DATETIME NOT NULL,
    prescribed_by VARCHAR(100),
    medication_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patient(patient_id) ON DELETE CASCADE,
    INDEX idx_patient_datetime (patient_id, medication_date_time),
    INDEX idx_datetime (medication_date_time),
    INDEX idx_medication_name (medication_name)
);

-- ============================================
-- ALERT MANAGEMENT TABLES
-- ============================================

-- Alert table - Generated alerts
CREATE TABLE IF NOT EXISTS alert (
    alert_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    facility_id INT,
    alert_type VARCHAR(500) NOT NULL,
    alert_detail TEXT,
    alert_date_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    alert_archive TINYINT DEFAULT 0,
    alert_severity ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
    reviewed_by INT,
    reviewed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patient(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (facility_id) REFERENCES facility(facility_id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by) REFERENCES admin(admin_id) ON DELETE SET NULL,
    INDEX idx_patient_datetime (patient_id, alert_date_time),
    INDEX idx_facility_archive (facility_id, alert_archive),
    INDEX idx_archive_datetime (alert_archive, alert_date_time),
    INDEX idx_severity (alert_severity)
);

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Insert sample facility
INSERT IGNORE INTO facility (facility_id, facility_name, facility_email) VALUES 
(1, 'Sample Healthcare Center', 'admin@samplehealthcare.com');

-- Insert sample physician
INSERT IGNORE INTO physician (physician_id, physician_first_name, physician_last_name, physician_email) VALUES 
(1, 'John', 'Smith', 'dr.smith@samplehealthcare.com');

-- Insert sample admin (password: admin123 - change in production!)
INSERT IGNORE INTO admin (admin_id, admin_first_name, admin_last_name, admin_email, admin_password) VALUES 
(1, 'Admin', 'User', 'admin@system.com', 'admin123');

-- Insert sample patient
INSERT IGNORE INTO patient (patient_id, patient_first_name, patient_last_name, patient_dob, patient_gender, patient_room, facility_id, physician_id) VALUES 
(1, 'Jane', 'Doe', '1980-01-15', 'Female', '101A', 1, 1);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Show all created tables
SHOW TABLES;

-- Verify table structures
DESCRIBE facility;
DESCRIBE physician;
DESCRIBE admin;
DESCRIBE patient;
DESCRIBE vitals_data;
DESCRIBE lab_result;
DESCRIBE medication;
DESCRIBE alert;

-- Show foreign key relationships
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
    AND REFERENCED_TABLE_NAME IS NOT NULL;