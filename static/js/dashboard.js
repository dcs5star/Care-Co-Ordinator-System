// Global variables
let currentPage = 1;
let selectedFacilities = [];
let currentPatientId = null;
let currentAlertId = null;
let currentPatientName = '';
let alertCheckInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadFacilities(); // This will call loadAlerts() and loadArchivedAlerts() after facilities are loaded
    loadActivities();
    initializeSidebarToggle();
    initializeChatbotToggle();
    initializeTabNavigation();
    startAlertChecker();
    initializeChatbot();
});

// Sidebar toggle
function initializeSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const sidebarToggle = document.getElementById('sidebarToggle');
    let isCollapsed = false;

    sidebarToggle.addEventListener('click', function() {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('expanded');
            sidebarToggle.innerHTML = '<i class="bi bi-chevron-right"></i>';
        } else {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('expanded');
            sidebarToggle.innerHTML = '<i class="bi bi-list"></i>';
        }
    });
}

// Chatbot toggle - same pattern as sidebar
function initializeChatbotToggle() {
    const chatbotPanel = document.getElementById('chatbotPanel');
    const chatbotToggle = document.getElementById('chatbotToggleBtn');
    let isCollapsed = true; // Start collapsed

    if (chatbotToggle && chatbotPanel) {
        chatbotToggle.addEventListener('click', function() {
            isCollapsed = !isCollapsed;
            if (isCollapsed) {
                chatbotPanel.classList.add('collapsed');
                chatbotToggle.innerHTML = '<i class="bi bi-chat-dots"></i>';
            } else {
                chatbotPanel.classList.remove('collapsed');
                chatbotToggle.innerHTML = '<i class="bi bi-chat-dots-fill"></i>';
            }
        });
    }
}

// Tab navigation
function initializeTabNavigation() {
    document.getElementById('alertsTab').addEventListener('click', function(e) {
        e.preventDefault();
        showAlertsDashboard();
    });
    
    document.getElementById('residentTab').addEventListener('click', function(e) {
        e.preventDefault();
        if (currentPatientId) {
            showResidentDetails();
        }
    });
}

function showAlertsDashboard() {
    document.getElementById('alertsDashboard').style.display = 'block';
    document.getElementById('residentDetail').style.display = 'none';
    document.getElementById('alertsTab').classList.add('active');
    document.getElementById('residentTab').classList.remove('active');
}

function showResidentDetails() {
    document.getElementById('alertsDashboard').style.display = 'none';
    document.getElementById('residentDetail').style.display = 'block';
    document.getElementById('alertsTab').classList.remove('active');
    document.getElementById('residentTab').classList.add('active');
}

// Load facilities
async function loadFacilities() {
    try {
        const response = await fetch('/api/facilities');
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById('facilityFilters');
            const allFacilitiesCheckbox = document.getElementById('allFacilities');
            
            // Clear existing facilities (keep "All Facilities")
            const existingFacilities = container.querySelectorAll('.facility-filter');
            existingFacilities.forEach(el => el.parentElement.remove());
            
            // Clear and rebuild selectedFacilities array
            selectedFacilities = [];
            
            // Add facilities
            data.facilities.forEach(facility => {
                const div = document.createElement('div');
                div.className = 'form-check';
                div.innerHTML = `
                    <input class="form-check-input facility-filter" type="checkbox" 
                           value="${facility.facility_id}" id="facility${facility.facility_id}" checked>
                    <label class="form-check-label" for="facility${facility.facility_id}">
                        ${facility.facility_name}
                    </label>
                `;
                container.appendChild(div);
                
                // Add to selectedFacilities since checkbox is checked by default
                selectedFacilities.push(facility.facility_id);
            });
            
            // Add event listeners
            allFacilitiesCheckbox.addEventListener('change', function() {
                const facilityCheckboxes = document.querySelectorAll('.facility-filter');
                facilityCheckboxes.forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
                if (this.checked) {
                    // If checking "All", select all facilities
                    updateSelectedFacilities();
                } else {
                    // If unchecking "All", clear all selections
                    selectedFacilities = [];
                }
                loadAlerts();
                loadArchivedAlerts();
            });
            
            document.querySelectorAll('.facility-filter').forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    updateSelectedFacilities();
                    updateAllFacilitiesCheckbox();
                    loadAlerts();
                    loadArchivedAlerts();
                });
            });
            
            // Load alerts and archived alerts after facilities are initialized
            loadAlerts();
            loadArchivedAlerts();
        }
    } catch (error) {
        console.error('Error loading facilities:', error);
    }
}

function updateSelectedFacilities() {
    selectedFacilities = Array.from(document.querySelectorAll('.facility-filter:checked'))
        .map(cb => cb.value);
}

function updateAllFacilitiesCheckbox() {
    const allCheckboxes = document.querySelectorAll('.facility-filter');
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    document.getElementById('allFacilities').checked = allChecked;
}

// Load alerts
async function loadAlerts(page = 1) {
    try {
        currentPage = page;
        const facilities = selectedFacilities.join(',');
        const response = await fetch(`/api/alerts?facilities=${facilities}&page=${page}&per_page=6`);
        const data = await response.json();
        
        if (data.success) {
            displayAlerts(data.alerts);
            displayPagination(data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

function displayAlerts(alerts) {
    const tbody = document.getElementById('alertsTableBody');
    tbody.innerHTML = '';
    
    if (alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No alerts found for selected facilities</td></tr>';
        return;
    }
    
    alerts.forEach(alert => {
        const tr = document.createElement('tr');
        tr.className = getAlertRowClass(alert.alert_type);
        tr.innerHTML = `
            <td><a href="#" class="resident-link" data-patient-id="${alert.patient_id}" data-alert-id="${alert.alert_id}">
                ${alert.patient_first_name} ${alert.patient_last_name}
            </a></td>
            <td>${alert.facility_name}</td>
            <td>${alert.alert_type}</td>
            <td>${alert.alert_date_time}</td>
            <td>
                <button class="btn btn-sm btn-primary review-btn me-1" 
                        data-patient-id="${alert.patient_id}" 
                        data-alert-id="${alert.alert_id}"
                        data-patient-name="${alert.patient_first_name} ${alert.patient_last_name}">
                    Review
                </button>
                <button class="btn btn-sm btn-secondary archive-btn" 
                        data-alert-id="${alert.alert_id}"
                        data-patient-name="${alert.patient_first_name} ${alert.patient_last_name}">
                    Archive
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add event listeners
    document.querySelectorAll('.review-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const patientId = this.getAttribute('data-patient-id');
            const alertId = this.getAttribute('data-alert-id');
            const patientName = this.getAttribute('data-patient-name');
            reviewAlert(patientId, alertId, patientName);
        });
    });
    
    document.querySelectorAll('.archive-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const alertId = this.getAttribute('data-alert-id');
            const patientName = this.getAttribute('data-patient-name');
            archiveAlert(alertId, patientName);
        });
    });
    
    document.querySelectorAll('.resident-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const patientId = this.getAttribute('data-patient-id');
            const alertId = this.getAttribute('data-alert-id');
            const patientName = this.textContent.trim();
            reviewAlert(patientId, alertId, patientName);
        });
    });
}

function getAlertRowClass(alertType) {
    const lowerType = alertType.toLowerCase();
    if (lowerType.includes('weight') || lowerType.includes('high hr') || lowerType.includes('heart')) {
        return 'alert-danger';
    } else if (lowerType.includes('low') || lowerType.includes('decreased')) {
        return 'alert-warning';
    }
    return '';
}

function displayPagination(currentPage, totalPages) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>`;
    pagination.appendChild(prevLi);
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
        pagination.appendChild(li);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>`;
    pagination.appendChild(nextLi);
    
    // Add event listeners
    pagination.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            if (!this.parentElement.classList.contains('disabled')) {
                const page = parseInt(this.getAttribute('data-page'));
                loadAlerts(page);
            }
        });
    });
}

// Load activities
async function loadActivities() {
    try {
        const response = await fetch('/api/activities');
        const data = await response.json();
        
        if (data.success) {
            displayActivities(data.activities);
        }
    } catch (error) {
        console.error('Error loading activities:', error);
    }
}

function displayActivities(activities) {
    const list = document.getElementById('recentActivityList');
    list.innerHTML = '';
    
    if (activities.length === 0) {
        list.innerHTML = '<li class="list-group-item">No recent activities</li>';
        return;
    }
    
    activities.forEach(activity => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = activity;
        list.appendChild(li);
    });
}

// Review alert
async function reviewAlert(patientId, alertId, patientName) {
    currentPatientId = patientId;
    currentAlertId = alertId;
    currentPatientName = patientName;
    
    // Log review activity
    await fetch('/api/log-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_name: patientName })
    });
    
    // Load patient details
    await loadPatientDetails(patientId, alertId);
    
    // Show resident details view
    showResidentDetails();
    
    // Reload activities
    loadActivities();
}

// Load patient details
async function loadPatientDetails(patientId, alertId) {
    try {
        // Load patient info
        const patientResponse = await fetch(`/api/patient/${patientId}`);
        const patientData = await patientResponse.json();
        
        // Load alert details
        const alertResponse = await fetch(`/api/alert/${alertId}`);
        const alertData = await alertResponse.json();
        
        // Load recommendation
        const recResponse = await fetch(`/api/recommendation/${alertId}`);
        const recData = await recResponse.json();
        
        // Load vitals
        const vitalsResponse = await fetch(`/api/vitals/${patientId}`);
        const vitalsData = await vitalsResponse.json();
        
        // Load medications
        const medsResponse = await fetch(`/api/medications/${patientId}`);
        const medsData = await medsResponse.json();
        
        // Load labs
        const labsResponse = await fetch(`/api/labs/${patientId}`);
        const labsData = await labsResponse.json();
        
        // Display all data
        displayPatientDetails(patientData.patient, alertData.alert, recData.recommendation, 
                            vitalsData.vitals, medsData.medications, labsData.labs);
    } catch (error) {
        console.error('Error loading patient details:', error);
    }
}

function displayPatientDetails(patient, alert, recommendation, vitals, medications, labs) {
    const container = document.getElementById('residentDetail');
    
    const html = `
        <div class="row">
            <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <button class="btn btn-outline-primary" id="backToAlertsBtn">
                        <i class="bi bi-arrow-left"></i> Back to Alerts
                    </button>
                </div>
                
                <div class="resident-header">
                    <h2>${patient.patient_first_name} ${patient.patient_last_name} 
                        <small class="text-muted">RJ${patient.patient_id}</small>
                    </h2>
                    <div class="resident-info">
                        <div class="resident-info-item">
                            <strong>DOB/Age</strong>
                            <span>${patient.patient_dob} (${patient.patient_age})</span>
                        </div>
                        <div class="resident-info-item">
                            <strong>Gender</strong>
                            <span>${patient.patient_gender}</span>
                        </div>
                        <div class="resident-info-item">
                            <strong>Facility</strong>
                            <span>${patient.facility_name}</span>
                        </div>
                        <div class="resident-info-item">
                            <strong>Room</strong>
                            <span>${patient.patient_room}</span>
                        </div>
                        <div class="resident-info-item">
                            <strong>Admission Date</strong>
                            <span>${patient.patient_admission_date}</span>
                        </div>
                        <div class="resident-info-item">
                            <strong>Physician</strong>
                            <span>Dr. ${patient.physician_first_name} ${patient.physician_last_name}</span>
                        </div>
                        <div class="resident-info-item">
                            <strong>Insurance</strong>
                            <span>${patient.patient_insurance || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row">
            <div class="col-12 mb-4">
                <div class="card">
                    <div class="card-header bg-danger text-white">
                        <h5 class="card-title mb-0">Alert Details</h5>
                    </div>
                    <div class="card-body">
                        <h6>${alert.alert_type}</h6>
                        <p>${alert.alert_detail}</p>
                    </div>
                </div>
            </div>
            
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white">
                        <h5 class="card-title mb-0">AI-Generated Recommendation</h5>
                    </div>
                    <div class="card-body">
                        <div class="ai-recommendation">
                            <div class="ai-recommendation-header">
                                <div class="ai-recommendation-title">
                                    <i class="bi bi-robot me-2"></i> Clinical Assessment & Recommendation
                                </div>
                                <button class="btn btn-sm btn-outline-primary" id="messageCareTeamBtn">
                                    <i class="bi bi-chat-dots"></i> Message Care Team
                                </button>
                            </div>
                            <div class="recommendation-text">
                                ${recommendation ? recommendation.replace(/\n/g, '<br>') : 'Recommendation not available'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card mt-3">
                    <div class="card-header bg-light">
                        <h5 class="card-title mb-0">Clinical Data</h5>
                    </div>
                    <div class="card-body">
                        <ul class="nav nav-tabs clinical-data-nav" id="clinicalTabs" role="tablist">
                            <li class="nav-item">
                                <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#vitals">Vitals</button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#diagnoses">Diagnoses</button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#medications">Medications</button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#labs">Lab Results</button>
                            </li>
                        </ul>
                        <div class="tab-content" id="clinicalTabsContent">
                            <div class="tab-pane fade show active clinical-data-tab" id="vitals">
                                ${displayVitals(vitals)}
                            </div>
                            <div class="tab-pane fade clinical-data-tab" id="diagnoses">
                                <p class="text-muted">Diagnoses data not available in current schema</p>
                            </div>
                            <div class="tab-pane fade clinical-data-tab" id="medications">
                                ${displayMedications(medications)}
                            </div>
                            <div class="tab-pane fade clinical-data-tab" id="labs">
                                ${displayLabs(labs)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners
    document.getElementById('backToAlertsBtn').addEventListener('click', showAlertsDashboard);
    document.getElementById('messageCareTeamBtn').addEventListener('click', openMessageModal);
}

function displayVitals(vitals) {
    if (!vitals || vitals.length === 0) {
        return '<p class="text-muted">No vital signs recorded</p>';
    }
    
    let html = '<ul class="list-group list-group-flush">';
    vitals.forEach(vital => {
        html += `
            <li class="list-group-item">
                <strong>Blood Pressure:</strong> ${vital.blood_pressure || 'N/A'}<br>
                <strong>Heart Rate:</strong> ${vital.heart_rate || 'N/A'} bpm<br>
                <strong>Temperature:</strong> ${vital.temperature || 'N/A'} °F<br>
                <strong>Weight:</strong> ${vital.weight || 'N/A'} lbs<br>
                <strong>Height:</strong> ${vital.height || 'N/A'}"<br>
                <strong>BMI:</strong> ${vital.BMI || 'N/A'}<br>
                <strong>SpO₂:</strong> ${vital.spo2 || 'N/A'}%<br>
                <small class="text-muted">Recorded: ${vital.vitals_date_time}</small>
            </li>
        `;
    });
    html += '</ul>';
    return html;
}

function displayMedications(medications) {
    if (!medications || medications.length === 0) {
        return '<p class="text-muted">No medications recorded</p>';
    }
    
    let html = '<ul class="list-group list-group-flush">';
    medications.forEach(med => {
        html += `
            <li class="list-group-item">
                <strong>${med.medication_name}</strong> - ${med.medication_dose}<br>
                <small class="text-muted">Prescribed: ${med.medication_date_time}</small>
            </li>
        `;
    });
    html += '</ul>';
    return html;
}

function displayLabs(labs) {
    if (!labs || labs.length === 0) {
        return '<p class="text-muted">No lab results recorded</p>';
    }
    
    let html = '<ul class="list-group list-group-flush">';
    labs.forEach(lab => {
        html += `
            <li class="list-group-item">
                <strong>Sodium:</strong> ${lab.sodium || 'N/A'} mEq/L<br>
                <strong>Potassium:</strong> ${lab.potassium || 'N/A'} mEq/L<br>
                <strong>BUN:</strong> ${lab.BUN || 'N/A'} mg/dL<br>
                <strong>Creatinine:</strong> ${lab.creatinine || 'N/A'} mg/dL<br>
                <strong>Glucose:</strong> ${lab.glucose || 'N/A'} mg/dL<br>
                <small class="text-muted">Test Date: ${lab.lab_date_time}</small>
            </li>
        `;
    });
    html += '</ul>';
    return html;
}

// Message care team modal
async function openMessageModal() {
    try {
        // Get patient and physician emails
        const patientResponse = await fetch(`/api/patient/${currentPatientId}`);
        const patientData = await patientResponse.json();
        const patient = patientData.patient;
        
        // Get recommendation
        const recResponse = await fetch(`/api/recommendation/${currentAlertId}`);
        const recData = await recResponse.json();
        
        // Get alert
        const alertResponse = await fetch(`/api/alert/${currentAlertId}`);
        const alertData = await alertResponse.json();
        
        // Populate modal
        const recipients = [];
        if (patient.physician_email) recipients.push(patient.physician_email);
        if (patient.facility_email) recipients.push(patient.facility_email);
        
        document.getElementById('emailRecipients').value = recipients.join(', ');
        
        const message = `Dear Care Team,

Based on our review of ${patient.patient_first_name} ${patient.patient_last_name}'s recent ${alertData.alert.alert_type}, we recommend the following actions:

${recData.recommendation || 'Recommendation not available'}

Please let me know if you have any questions or concerns.

Thank you`;
        
        document.getElementById('emailMessage').value = message;
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('messageCareTeamModal'));
        modal.show();
        
        // Add send button listener
        document.getElementById('sendEmailBtn').onclick = sendEmail;
        document.getElementById('attachBtn').onclick = () => alert('Attachment feature coming soon');
        
    } catch (error) {
        console.error('Error opening message modal:', error);
    }
}

async function sendEmail() {
    try {
        const recipients = document.getElementById('emailRecipients').value.split(',').map(e => e.trim());
        const message = document.getElementById('emailMessage').value;
        
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipients: recipients,
                subject: `Clinical Recommendation for ${currentPatientName}`,
                message: message,
                patient_name: currentPatientName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Email sent successfully!');
            bootstrap.Modal.getInstance(document.getElementById('messageCareTeamModal')).hide();
            loadActivities();
        } else {
            alert('Failed to send email: ' + data.message);
        }
    } catch (error) {
        console.error('Error sending email:', error);
        alert('An error occurred while sending the email');
    }
}


// Alert checker - checks every minute for new alerts
function startAlertChecker() {
    // Check immediately
    checkForNewAlerts();
    
    // Then check every minute (60000 ms)
    alertCheckInterval = setInterval(checkForNewAlerts, 60000);
}

async function checkForNewAlerts() {
    try {
        const response = await fetch('/api/check-new-alerts');
        const data = await response.json();
        
        if (data.success && data.has_new_alerts) {
            showNewAlertNotification(data.count);
        }
    } catch (error) {
        console.error('Error checking for new alerts:', error);
    }
}

function showNewAlertNotification(count) {
    // Check if notification already shown
    if (document.getElementById('newAlertNotification')) {
        return;
    }
    
    // Create notification popup
    const notification = document.createElement('div');
    notification.id = 'newAlertNotification';
    notification.className = 'alert alert-info alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 350px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-bell-fill me-2" style="font-size: 1.5rem;"></i>
            <div class="flex-grow-1">
                <strong>New Alert${count > 1 ? 's' : ''} Generated!</strong>
                <p class="mb-0 small">${count} new alert${count > 1 ? 's have' : ' has'} been generated. Refresh to view.</p>
            </div>
        </div>
        <hr class="my-2">
        <div class="d-flex gap-2">
            <button class="btn btn-sm btn-primary flex-grow-1" onclick="refreshPage()">
                <i class="bi bi-arrow-clockwise me-1"></i> Refresh Now
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-dismiss after 30 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 30000);
}

function refreshPage() {
    window.location.reload();
}


// Archive alert
async function archiveAlert(alertId, patientName) {
    if (!confirm(`Are you sure you want to archive this alert for ${patientName}?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/archive-alert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                alert_id: alertId,
                patient_name: patientName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Alert archived successfully', 'success');
            loadAlerts(currentPage);
            loadArchivedAlerts(1);
        } else {
            showNotification('Failed to archive alert: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error archiving alert:', error);
        showNotification('Error archiving alert', 'error');
    }
}

// Load archived alerts
async function loadArchivedAlerts(page = 1) {
    try {
        const facilities = selectedFacilities.join(',');
        const response = await fetch(`/api/archived-alerts?facilities=${facilities}&page=${page}&per_page=6`);
        const data = await response.json();
        
        if (data.success) {
            displayArchivedAlerts(data.alerts);
            displayArchivedPagination(data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Error loading archived alerts:', error);
    }
}

function displayArchivedAlerts(alerts) {
    const tbody = document.getElementById('archivedAlertsTableBody');
    tbody.innerHTML = '';
    
    if (alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No archived alerts</td></tr>';
        return;
    }
    
    alerts.forEach(alert => {
        const tr = document.createElement('tr');
        tr.className = getAlertRowClass(alert.alert_type);
        tr.innerHTML = `
            <td><a href="#" class="resident-link" data-patient-id="${alert.patient_id}" data-alert-id="${alert.alert_id}">
                ${alert.patient_first_name} ${alert.patient_last_name}
            </a></td>
            <td>${alert.facility_name}</td>
            <td>${alert.alert_type}</td>
            <td>${alert.alert_date_time}</td>
            <td><button class="btn btn-sm btn-primary review-btn" 
                        data-patient-id="${alert.patient_id}" 
                        data-alert-id="${alert.alert_id}"
                        data-patient-name="${alert.patient_first_name} ${alert.patient_last_name}">
                Review
            </button></td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add event listeners
    document.querySelectorAll('#archivedAlertsTableBody .review-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const patientId = this.getAttribute('data-patient-id');
            const alertId = this.getAttribute('data-alert-id');
            const patientName = this.getAttribute('data-patient-name');
            reviewAlert(patientId, alertId, patientName);
        });
    });
    
    document.querySelectorAll('#archivedAlertsTableBody .resident-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const patientId = this.getAttribute('data-patient-id');
            const alertId = this.getAttribute('data-alert-id');
            currentPatientId = patientId;
            currentAlertId = alertId;
            showResidentDetails();
        });
    });
}

function displayArchivedPagination(currentPage, totalPages) {
    const pagination = document.getElementById('archivedPagination');
    pagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        li.addEventListener('click', function(e) {
            e.preventDefault();
            loadArchivedAlerts(i);
        });
        pagination.appendChild(li);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-danger' : 'alert-info';
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    notification.style.zIndex = '9999';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}


// Start alert checker - polls for new alerts every 10 seconds
function startAlertChecker() {
    // Check immediately on load
    checkForNewAlerts();
    
    // Then check every 10 seconds
    alertCheckInterval = setInterval(checkForNewAlerts, 10000);
}

// Check for new alerts
async function checkForNewAlerts() {
    try {
        const response = await fetch('/api/check-new-alerts');
        const data = await response.json();
        
        if (data.success && data.has_new_alerts) {
            showAlertNotification(data.count);
            // Reload alerts to show the new ones
            loadAlerts(currentPage);
            loadArchivedAlerts(1);
        }
    } catch (error) {
        console.error('Error checking for new alerts:', error);
    }
}

// Show alert notification popup
function showAlertNotification(count) {
    const message = count === 1 ? '1 new alert!' : `${count} new alerts!`;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    notification.innerHTML = `
        <strong><i class="bi bi-exclamation-triangle-fill me-2"></i>New Alert!</strong>
        <p class="mb-0">${message}</p>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Play notification sound (optional)
    playNotificationSound();
}

// Play notification sound
function playNotificationSound() {
    // Create a simple beep sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        // Silently fail if audio not supported
        console.log('Audio notification not supported');
    }
}


// Start alert checker - polls for new alerts every 10 seconds
function startAlertChecker() {
    // Check immediately on load
    checkForNewAlerts();
    
    // Then check every 10 seconds
    alertCheckInterval = setInterval(checkForNewAlerts, 10000);
}

// Check for new alerts
async function checkForNewAlerts() {
    try {
        const response = await fetch('/api/check-new-alerts');
        const data = await response.json();
        
        if (data.success && data.has_new_alerts) {
            showAlertNotification(data.count);
            // Reload alerts to show the new ones
            loadAlerts(currentPage);
            loadArchivedAlerts(1);
        }
    } catch (error) {
        console.error('Error checking for new alerts:', error);
    }
}

// Show alert notification popup
function showAlertNotification(count) {
    const message = count === 1 ? '1 new alert!' : `${count} new alerts!`;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    notification.innerHTML = `
        <strong><i class="bi bi-exclamation-triangle-fill me-2"></i>New Alert!</strong>
        <p class="mb-0">${message}</p>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Play notification sound (optional)
    playNotificationSound();
}

// Play notification sound
function playNotificationSound() {
    // Create a simple beep sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        // Silently fail if audio not supported
        console.log('Audio notification not supported');
    }
}

// Archive alert
async function archiveAlert(alertId, patientName) {
    if (!confirm(`Are you sure you want to archive this alert for ${patientName}?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/archive-alert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                alert_id: alertId,
                patient_name: patientName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Alert archived successfully', 'success');
            loadAlerts(currentPage);
            loadArchivedAlerts(1);
        } else {
            showNotification('Failed to archive alert: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error archiving alert:', error);
        showNotification('Error archiving alert', 'error');
    }
}

// Load archived alerts
async function loadArchivedAlerts(page = 1) {
    try {
        const facilities = selectedFacilities.join(',');
        const response = await fetch(`/api/archived-alerts?facilities=${facilities}&page=${page}&per_page=6`);
        const data = await response.json();
        
        if (data.success) {
            displayArchivedAlerts(data.alerts);
            displayArchivedPagination(data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Error loading archived alerts:', error);
    }
}

function displayArchivedAlerts(alerts) {
    const tbody = document.getElementById('archivedAlertsTableBody');
    tbody.innerHTML = '';
    
    if (alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No archived alerts</td></tr>';
        return;
    }
    
    alerts.forEach(alert => {
        const tr = document.createElement('tr');
        tr.className = getAlertRowClass(alert.alert_type);
        tr.innerHTML = `
            <td><a href="#" class="resident-link" data-patient-id="${alert.patient_id}" data-alert-id="${alert.alert_id}">
                ${alert.patient_first_name} ${alert.patient_last_name}
            </a></td>
            <td>${alert.facility_name}</td>
            <td>${alert.alert_type}</td>
            <td>${alert.alert_date_time}</td>
            <td><button class="btn btn-sm btn-primary review-btn" 
                        data-patient-id="${alert.patient_id}" 
                        data-alert-id="${alert.alert_id}"
                        data-patient-name="${alert.patient_first_name} ${alert.patient_last_name}">
                Review
            </button></td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add event listeners
    document.querySelectorAll('#archivedAlertsTableBody .review-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const patientId = this.getAttribute('data-patient-id');
            const alertId = this.getAttribute('data-alert-id');
            const patientName = this.getAttribute('data-patient-name');
            reviewAlert(patientId, alertId, patientName);
        });
    });
    
    document.querySelectorAll('#archivedAlertsTableBody .resident-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const patientId = this.getAttribute('data-patient-id');
            const alertId = this.getAttribute('data-alert-id');
            currentPatientId = patientId;
            currentAlertId = alertId;
            showResidentDetails();
        });
    });
}

function displayArchivedPagination(currentPage, totalPages) {
    const pagination = document.getElementById('archivedPagination');
    pagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        li.addEventListener('click', function(e) {
            e.preventDefault();
            loadArchivedAlerts(i);
        });
        pagination.appendChild(li);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-danger' : 'alert-info';
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    notification.style.zIndex = '9999';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}


// ============ ALERT NOTIFICATION SYSTEM ============
function startAlertChecker() {
    checkForNewAlerts();
    setInterval(checkForNewAlerts, 10000);
}

async function checkForNewAlerts() {
    try {
        const response = await fetch('/api/check-new-alerts');
        const data = await response.json();
        if (data.success && data.has_new_alerts) {
            showAlertNotification(data.count);
            loadAlerts(currentPage);
            loadArchivedAlerts(1);
        }
    } catch (error) {
        console.error('Error checking alerts:', error);
    }
}

function showAlertNotification(count) {
    const msg = count === 1 ? '1 new alert!' : `${count} new alerts!`;
    const notif = document.createElement('div');
    notif.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    notif.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    notif.innerHTML = `<strong><i class="bi bi-exclamation-triangle-fill me-2"></i>New Alert!</strong><p class="mb-0">${msg}</p><button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(notif);
    playNotificationSound();
}

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
}

// ============ ARCHIVE FUNCTIONALITY ============
async function archiveAlert(alertId, patientName) {
    if (!confirm(`Archive alert for ${patientName}?`)) return;
    try {
        const response = await fetch('/api/archive-alert', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({alert_id: alertId, patient_name: patientName})
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Alert archived', 'success');
            loadAlerts(currentPage);
            loadArchivedAlerts(1);
        } else {
            showNotification('Failed: ' + data.message, 'error');
        }
    } catch (error) {
        showNotification('Error archiving alert', 'error');
    }
}

async function loadArchivedAlerts(page = 1) {
    try {
        const facilities = selectedFacilities.join(',');
        const response = await fetch(`/api/archived-alerts?facilities=${facilities}&page=${page}&per_page=6`);
        const data = await response.json();
        if (data.success) {
            displayArchivedAlerts(data.alerts);
            displayArchivedPagination(data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Error loading archived alerts:', error);
    }
}

function displayArchivedAlerts(alerts) {
    const tbody = document.getElementById('archivedAlertsTableBody');
    tbody.innerHTML = '';
    if (alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No archived alerts</td></tr>';
        return;
    }
    alerts.forEach(alert => {
        const tr = document.createElement('tr');
        tr.className = getAlertRowClass(alert.alert_type);
        tr.innerHTML = `
            <td><a href="#" class="resident-link" data-patient-id="${alert.patient_id}" data-alert-id="${alert.alert_id}">
                ${alert.patient_first_name} ${alert.patient_last_name}</a></td>
            <td>${alert.facility_name}</td>
            <td>${alert.alert_type}</td>
            <td>${alert.alert_date_time}</td>
            <td><button class="btn btn-sm btn-primary review-btn" 
                        data-patient-id="${alert.patient_id}" 
                        data-alert-id="${alert.alert_id}"
                        data-patient-name="${alert.patient_first_name} ${alert.patient_last_name}">Review</button></td>
        `;
        tbody.appendChild(tr);
    });
    document.querySelectorAll('#archivedAlertsTableBody .review-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            reviewAlert(this.getAttribute('data-patient-id'), this.getAttribute('data-alert-id'), this.getAttribute('data-patient-name'));
        });
    });
    document.querySelectorAll('#archivedAlertsTableBody .resident-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            currentPatientId = this.getAttribute('data-patient-id');
            currentAlertId = this.getAttribute('data-alert-id');
            showResidentDetails();
        });
    });
}

function displayArchivedPagination(currentPage, totalPages) {
    const pagination = document.getElementById('archivedPagination');
    pagination.innerHTML = '';
    if (totalPages <= 1) return;
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        li.addEventListener('click', function(e) {
            e.preventDefault();
            loadArchivedAlerts(i);
        });
        pagination.appendChild(li);
    }
}

function showNotification(message, type = 'info') {
    const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-danger' : 'alert-info';
    const notif = document.createElement('div');
    notif.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    notif.style.zIndex = '9999';
    notif.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}


// Simple alert checker - checks every 60 seconds
let lastAlertCount = 0;

function startAlertChecker() {
    // Check every 60 seconds (same as backend evaluation cycle)
    setInterval(checkForNewAlerts, 60000);
}

async function checkForNewAlerts() {
    try {
        const response = await fetch('/api/alerts?facilities=' + selectedFacilities.join(',') + '&page=1&per_page=100');
        const data = await response.json();
        
        if (data.success) {
            const currentAlertCount = data.total;
            
            // If alert count increased, show notification
            if (lastAlertCount > 0 && currentAlertCount > lastAlertCount) {
                const newAlerts = currentAlertCount - lastAlertCount;
                showNewAlertPopup(newAlerts);
                
                // Reload the alerts display
                loadAlerts(currentPage);
                loadArchivedAlerts(1);
            }
            
            lastAlertCount = currentAlertCount;
        }
    } catch (error) {
        console.error('Error checking for new alerts:', error);
    }
}

function showNewAlertPopup(count) {
    const message = count === 1 ? '1 new alert detected!' : `${count} new alerts detected!`;
    
    // Remove any existing notification
    const existing = document.querySelector('.new-alert-notification');
    if (existing) {
        existing.remove();
    }
    
    // Create notification popup with dark pink background and white text
    const notification = document.createElement('div');
    notification.className = 'alert alert-dismissible fade show position-fixed new-alert-notification';
    notification.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); background-color: #C71585; color: white; border: none;';
    notification.innerHTML = `
        <strong><i class="bi bi-exclamation-triangle-fill me-2"></i>New Alert!</strong>
        <p class="mb-0">${message}</p>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Play notification sound
    playNotificationSound();
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        // Silently fail if audio not supported
    }
}


// ============ CHATBOT FUNCTIONALITY ============
let chatbotOpen = true;

// Initialize chatbot
function initializeChatbot() {
    loadPatientsForChatbot();
    
    // Toggle chatbot panel
    document.getElementById('chatbotToggleBtn').addEventListener('click', function() {
        const panel = document.getElementById('chatbotPanel');
        const icon = this.querySelector('i');
        
        chatbotOpen = !chatbotOpen;
        
        if (chatbotOpen) {
            panel.classList.remove('collapsed');
            icon.className = 'bi bi-chat-dots-fill';
        } else {
            panel.classList.add('collapsed');
            icon.className = 'bi bi-chat-dots';
        }
    });
    
    // Show/hide patient select based on category
    document.getElementById('uploadCategory').addEventListener('change', function() {
        const patientContainer = document.getElementById('patientSelectContainer');
        if (this.value === 'patient') {
            patientContainer.style.display = 'block';
        } else {
            patientContainer.style.display = 'none';
        }
    });
    
    // Upload button
    document.getElementById('uploadBtn').addEventListener('click', uploadDocuments);
    
    // Send message button
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    
    // Enter key to send
    document.getElementById('chatInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

async function loadPatientsForChatbot() {
    try {
        const response = await fetch('/api/chatbot/patients');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('patientSelect');
            select.innerHTML = '<option value="">Select Patient...</option>';
            
            data.patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.patient_id;
                option.textContent = `${patient.patient_first_name} ${patient.patient_last_name} (ID: ${patient.patient_id})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

async function uploadDocuments() {
    const fileInput = document.getElementById('fileUpload');
    const category = document.getElementById('uploadCategory').value;
    const patientId = document.getElementById('patientSelect').value;
    
    if (!fileInput.files.length) {
        alert('Please select files to upload');
        return;
    }
    
    if (category === 'patient' && !patientId) {
        alert('Please select a patient');
        return;
    }
    
    const formData = new FormData();
    for (let file of fileInput.files) {
        formData.append('files', file);
    }
    formData.append('category', category);
    formData.append('patient_id', patientId);
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';
    
    try {
        const response = await fetch('/api/chatbot/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            fileInput.value = '';
        } else {
            alert('Upload failed: ' + data.message);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Upload Documents';
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    // Add user message to chat
    addMessageToChat(question, 'user');
    input.value = '';
    
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch('/api/chatbot/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question})
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.success) {
            addMessageToChat(data.answer, 'bot');
        } else {
            addMessageToChat('Sorry, I encountered an error: ' + data.message, 'bot');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat('Sorry, I encountered an error processing your question.', 'bot');
    }
}

function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove welcome message if exists
    const welcome = messagesContainer.querySelector('.text-center');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    messageDiv.innerHTML = `
        <div>${message}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message bot';
    typingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}

// Add to initialization
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    initializeChatbot();
});


// Initialize sidebar toggle
function initializeSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const sidebarToggle = document.getElementById('sidebarToggle');
    let isCollapsed = false;

    sidebarToggle.addEventListener('click', function() {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('expanded');
            sidebarToggle.innerHTML = '<i class="bi bi-chevron-right"></i>';
        } else {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('expanded');
            sidebarToggle.innerHTML = '<i class="bi bi-list"></i>';
        }
    });
}


// ============ CHATBOT FUNCTIONALITY ============
function initializeChatbot() {
    loadPatientsForChatbot();
    
    // Toggle chatbot panel
    const chatbotToggleBtn = document.getElementById('chatbotToggleBtn');
    if (chatbotToggleBtn) {
        chatbotToggleBtn.addEventListener('click', function() {
            const panel = document.getElementById('chatbotPanel');
            const icon = this.querySelector('i');
            
            if (panel.classList.contains('collapsed')) {
                panel.classList.remove('collapsed');
                icon.className = 'bi bi-chat-dots-fill';
            } else {
                panel.classList.add('collapsed');
                icon.className = 'bi bi-chat-dots';
            }
        });
    }
    
    // Show/hide patient select based on category
    const uploadCategory = document.getElementById('uploadCategory');
    if (uploadCategory) {
        uploadCategory.addEventListener('change', function() {
            const patientContainer = document.getElementById('patientSelectContainer');
            if (this.value === 'patient') {
                patientContainer.style.display = 'block';
            } else {
                patientContainer.style.display = 'none';
            }
        });
    }
    
    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadDocuments);
    }
    
    // Send message button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Enter key to send
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

async function loadPatientsForChatbot() {
    try {
        const response = await fetch('/api/chatbot/patients');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('patientSelect');
            select.innerHTML = '<option value="">Select Patient...</option>';
            
            data.patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.patient_id;
                option.textContent = `${patient.patient_first_name} ${patient.patient_last_name} (ID: ${patient.patient_id})`;
                select.appendChild(option);
            });
            
            console.log(`Loaded ${data.patients.length} patients for chatbot`);
        } else {
            console.error('Failed to load patients:', data.message);
        }
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

async function uploadDocuments() {
    const fileInput = document.getElementById('fileUpload');
    const category = document.getElementById('uploadCategory').value;
    const patientId = document.getElementById('patientSelect').value;
    
    if (!fileInput.files.length) {
        alert('Please select files to upload');
        return;
    }
    
    if (category === 'patient' && !patientId) {
        alert('Please select a patient');
        return;
    }
    
    const formData = new FormData();
    for (let file of fileInput.files) {
        formData.append('files', file);
    }
    formData.append('category', category);
    formData.append('patient_id', patientId);
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';
    
    try {
        const response = await fetch('/api/chatbot/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            fileInput.value = '';
        } else {
            alert('Upload failed: ' + data.message);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Upload Documents';
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    // Add user message to chat
    addMessageToChat(question, 'user');
    input.value = '';
    
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch('/api/chatbot/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question})
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.success) {
            addMessageToChat(data.answer, 'bot');
        } else {
            addMessageToChat('Error: ' + data.message, 'bot');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat('Network error: ' + error.message, 'bot');
    }
}

function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove welcome message if exists
    const welcome = messagesContainer.querySelector('.text-center');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    messageDiv.innerHTML = `
        <div>${message}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message bot';
    typingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}


// ============ CHATBOT FUNCTIONALITY ============
function initializeChatbot() {
    loadPatientsForChatbot();
    
    // Toggle chatbot panel
    const chatbotToggleBtn = document.getElementById('chatbotToggleBtn');
    if (chatbotToggleBtn) {
        chatbotToggleBtn.addEventListener('click', function() {
            const panel = document.getElementById('chatbotPanel');
            const icon = this.querySelector('i');
            
            if (panel.classList.contains('collapsed')) {
                panel.classList.remove('collapsed');
                icon.className = 'bi bi-chat-dots-fill';
            } else {
                panel.classList.add('collapsed');
                icon.className = 'bi bi-chat-dots';
            }
        });
    }
    
    // Show/hide patient select based on category
    const uploadCategory = document.getElementById('uploadCategory');
    if (uploadCategory) {
        uploadCategory.addEventListener('change', function() {
            const patientContainer = document.getElementById('patientSelectContainer');
            if (this.value === 'patient') {
                patientContainer.style.display = 'block';
            } else {
                patientContainer.style.display = 'none';
            }
        });
    }
    
    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadDocuments);
    }
    
    // Send message button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Enter key to send
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

async function loadPatientsForChatbot() {
    try {
        const response = await fetch('/api/chatbot/patients');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('patientSelect');
            select.innerHTML = '<option value="">Select Patient...</option>';
            
            data.patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.patient_id;
                option.textContent = `${patient.patient_first_name} ${patient.patient_last_name} (ID: ${patient.patient_id})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

async function uploadDocuments() {
    const fileInput = document.getElementById('fileUpload');
    const category = document.getElementById('uploadCategory').value;
    const patientId = document.getElementById('patientSelect').value;
    
    if (!fileInput.files.length) {
        alert('Please select files to upload');
        return;
    }
    
    if (category === 'patient' && !patientId) {
        alert('Please select a patient');
        return;
    }
    
    const formData = new FormData();
    for (let file of fileInput.files) {
        formData.append('files', file);
    }
    formData.append('category', category);
    formData.append('patient_id', patientId);
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';
    
    try {
        const response = await fetch('/api/chatbot/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            fileInput.value = '';
        } else {
            alert('Upload failed: ' + data.message);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Upload Documents';
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    // Add user message to chat
    addMessageToChat(question, 'user');
    input.value = '';
    
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch('/api/chatbot/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question})
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.success) {
            addMessageToChat(data.answer, 'bot');
        } else {
            addMessageToChat('Sorry, I encountered an error: ' + data.message, 'bot');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat('Network error: ' + error.message, 'bot');
    }
}

function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove welcome message if exists
    const welcome = messagesContainer.querySelector('.text-center');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    messageDiv.innerHTML = `
        <div>${message}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message bot';
    typingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}


// Initialize chatbot
function initializeChatbot() {
    console.log('Initializing chatbot...');
    loadPatientsForChatbot();
    
    // Toggle chatbot panel
    const chatbotToggleBtn = document.getElementById('chatbotToggleBtn');
    console.log('Chatbot toggle button:', chatbotToggleBtn);
    
    if (chatbotToggleBtn) {
        chatbotToggleBtn.addEventListener('click', function() {
            console.log('Chatbot toggle clicked!');
            const panel = document.getElementById('chatbotPanel');
            const icon = this.querySelector('i');
            
            console.log('Panel:', panel);
            console.log('Current classes:', panel.className);
            
            if (panel.classList.contains('collapsed')) {
                panel.classList.remove('collapsed');
                icon.className = 'bi bi-chat-dots-fill';
                console.log('Panel expanded');
            } else {
                panel.classList.add('collapsed');
                icon.className = 'bi bi-chat-dots';
                console.log('Panel collapsed');
            }
        });
    } else {
        console.error('Chatbot toggle button not found!');
    }
    
    // Show/hide patient select based on category
    const uploadCategory = document.getElementById('uploadCategory');
    if (uploadCategory) {
        uploadCategory.addEventListener('change', function() {
            const patientContainer = document.getElementById('patientSelectContainer');
            if (this.value === 'patient') {
                patientContainer.style.display = 'block';
            } else {
                patientContainer.style.display = 'none';
            }
        });
    }
    
    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadDocuments);
    }
    
    // Send message button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Enter key to send
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

async function loadPatientsForChatbot() {
    try {
        const response = await fetch('/api/chatbot/patients');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('patientSelect');
            select.innerHTML = '<option value="">Select Patient...</option>';
            
            data.patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.patient_id;
                option.textContent = `${patient.patient_first_name} ${patient.patient_last_name} (ID: ${patient.patient_id})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

async function uploadDocuments() {
    const fileInput = document.getElementById('fileUpload');
    const category = document.getElementById('uploadCategory').value;
    const patientId = document.getElementById('patientSelect').value;
    
    if (!fileInput.files.length) {
        alert('Please select files to upload');
        return;
    }
    
    if (category === 'patient' && !patientId) {
        alert('Please select a patient');
        return;
    }
    
    const formData = new FormData();
    for (let file of fileInput.files) {
        formData.append('files', file);
    }
    formData.append('category', category);
    formData.append('patient_id', patientId);
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';
    
    try {
        const response = await fetch('/api/chatbot/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            fileInput.value = '';
        } else {
            alert('Upload failed: ' + data.message);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Upload Documents';
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    // Add user message to chat
    addMessageToChat(question, 'user');
    input.value = '';
    
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch('/api/chatbot/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question})
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.success) {
            addMessageToChat(data.answer, 'bot');
        } else {
            addMessageToChat('Sorry, I encountered an error: ' + data.message, 'bot');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat('Network error: ' + error.message, 'bot');
    }
}

function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove welcome message if exists
    const welcome = messagesContainer.querySelector('.text-center');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    messageDiv.innerHTML = `
        <div>${message}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message bot';
    typingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}


// ===== CHATBOT FUNCTIONS - DO NOT REMOVE =====

function initializeChatbot() {
    console.log('Initializing chatbot...');
    loadPatientsForChatbot();
    
    const chatbotToggleBtn = document.getElementById('chatbotToggleBtn');
    const panel = document.getElementById('chatbotPanel');
    
    if (chatbotToggleBtn && panel) {
        chatbotToggleBtn.addEventListener('click', function() {
            const icon = this.querySelector('i');
            panel.classList.toggle('collapsed');
            
            if (panel.classList.contains('collapsed')) {
                icon.className = 'bi bi-chat-dots';
            } else {
                icon.className = 'bi bi-chat-dots-fill';
            }
        });
        console.log('Chatbot toggle button initialized');
    } else {
        console.error('Chatbot elements not found:', {button: !!chatbotToggleBtn, panel: !!panel});
    }
    
    const uploadCategory = document.getElementById('uploadCategory');
    if (uploadCategory) {
        uploadCategory.addEventListener('change', function() {
            const patientContainer = document.getElementById('patientSelectContainer');
            if (patientContainer) {
                patientContainer.style.display = this.value === 'patient' ? 'block' : 'none';
            }
        });
    }
    
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadDocuments);
    }
    
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

async function loadPatientsForChatbot() {
    try {
        const response = await fetch('/api/chatbot/patients');
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('patientSelect');
            if (select) {
                select.innerHTML = '<option value="">Select Patient...</option>';
                data.patients.forEach(patient => {
                    const option = document.createElement('option');
                    option.value = patient.patient_id;
                    option.textContent = `${patient.patient_first_name} ${patient.patient_last_name} (ID: ${patient.patient_id})`;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

async function uploadDocuments() {
    const fileInput = document.getElementById('fileUpload');
    const category = document.getElementById('uploadCategory').value;
    const patientId = document.getElementById('patientSelect').value;
    
    if (!fileInput.files.length) {
        alert('Please select files to upload');
        return;
    }
    if (category === 'patient' && !patientId) {
        alert('Please select a patient');
        return;
    }
    
    const formData = new FormData();
    for (let file of fileInput.files) {
        formData.append('files', file);
    }
    formData.append('category', category);
    formData.append('patient_id', patientId);
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';
    
    try {
        const response = await fetch('/api/chatbot/upload', {method: 'POST', body: formData});
        const data = await response.json();
        if (data.success) {
            alert(data.message);
            fileInput.value = '';
        } else {
            alert('Upload failed: ' + data.message);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Upload Documents';
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    if (!question) return;
    
    addMessageToChat(question, 'user');
    input.value = '';
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch('/api/chatbot/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question})
        });
        const data = await response.json();
        removeTypingIndicator(typingId);
        
        if (data.success) {
            addMessageToChat(data.answer, 'bot');
        } else {
            addMessageToChat('Error: ' + data.message, 'bot');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat('Network error: ' + error.message, 'bot');
    }
}

function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('chatMessages');
    const welcome = messagesContainer.querySelector('.text-center');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    messageDiv.innerHTML = `<div>${message}</div><div class="message-time">${time}</div>`;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message bot';
    typingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}
