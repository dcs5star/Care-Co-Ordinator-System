-- Create eval table to track last evaluated timestamps for each patient
CREATE TABLE IF NOT EXISTS eval (
    eval_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    lab_last_date_time DATETIME DEFAULT NULL,
    medication_last_date_time DATETIME DEFAULT NULL,
    vitals_last_date_time DATETIME DEFAULT NULL,
    last_eval_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_patient (patient_id),
    FOREIGN KEY (patient_id) REFERENCES patient(patient_id) ON DELETE CASCADE
);

-- Add alert_archive column to alert table
ALTER TABLE alert 
ADD COLUMN alert_archive TINYINT DEFAULT 0;

-- Verify the changes
DESCRIBE eval;
DESCRIBE alert;
