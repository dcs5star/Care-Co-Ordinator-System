"""
Care Co-Ordinator Dashboard - Flask Application
"""
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import os
import threading
import time
import boto3
import json
import pymysql
from datetime import datetime, timedelta
from dotenv import load_dotenv
from utils import get_admin_activities, log_admin_activity, get_recommendation_from_s3, send_email_ses
from functools import wraps

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'your-secret-key-change-in-production')

# Initialize AWS clients
bedrock_runtime = boto3.client('bedrock-runtime', region_name=os.getenv('AWS_REGION', 'us-east-1'))
s3_client = boto3.client('s3', region_name=os.getenv('AWS_REGION', 'us-east-1'))

class DatabaseClient:
    """
    Database client for MySQL database operations
    Provides consistent database access across the application
    """
    
    def __init__(self):
        self.host = os.getenv('RDS_HOST')
        self.port = int(os.getenv('RDS_PORT', '3306'))
        self.user = os.getenv('RDS_USER')
        self.password = os.getenv('RDS_PASS')
        self.database = os.getenv('RDS_DB')
    
    def execute_query(self, sql, params=None):
        """
        Execute SQL query with optional parameters
        Returns list of dicts for SELECT, True for other queries
        """
        conn = None
        try:
            conn = pymysql.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                database=self.database,
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=10
            )
            
            with conn.cursor() as cursor:
                if params:
                    cursor.execute(sql, params)
                else:
                    cursor.execute(sql)
                
                if sql.strip().upper().startswith('SELECT'):
                    results = cursor.fetchall()
                    return list(results) if results else []
                else:
                    conn.commit()
                    return True
                    
        except Exception as e:
            print(f"Database error: {e}")
            return None
        finally:
            if conn:
                conn.close()
    
    def fetch_one(self, sql, params=None):
        """Fetch one row"""
        results = self.execute_query(sql, params)
        return results[0] if results and len(results) > 0 else None
    
    def fetch_all(self, sql, params=None):
        """Fetch all rows"""
        results = self.execute_query(sql, params)
        return results if results else []

# Database client instance
db = DatabaseClient()

def login_required(f):
    """Decorator to require login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    """Redirect to login or dashboard"""
    if 'admin_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Admin login page"""
    if request.method == 'POST':
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        try:
            sql = f"SELECT admin_id, admin_first_name, admin_last_name FROM admin WHERE admin_email = '{email}' AND admin_password = '{password}'"
            result = db.fetch_one(sql)
            
            if result:
                session['admin_id'] = result['admin_id']
                session['admin_name'] = f"{result['admin_first_name']} {result['admin_last_name']}"
                return jsonify({'success': True})
            else:
                return jsonify({'success': False, 'message': 'Invalid email or password'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logout admin"""
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    """Main dashboard page"""
    return render_template('dashboard.html', 
                         admin_name=session.get('admin_name'),
                         admin_id=session.get('admin_id'))

@app.route('/api/facilities')
@login_required
def get_facilities():
    """Get all facilities"""
    try:
        facilities = db.fetch_all("SELECT facility_id, facility_name FROM facility ORDER BY facility_name")
        return jsonify({'success': True, 'facilities': facilities})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/alerts')
@login_required
def get_alerts():
    """Get alerts with optional facility filter"""
    try:
        facility_ids = request.args.get('facilities', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 6))
        
        # If facility_ids is empty string, return no alerts (user unchecked all)
        if facility_ids == '':
            all_alerts = []
        elif facility_ids:
            # Specific facilities selected
            query = f"""
            SELECT a.alert_id, a.patient_id, a.alert_type, a.alert_date_time, a.facility_id,
                   p.patient_first_name, p.patient_last_name, f.facility_name
            FROM alert a
            JOIN patient p ON a.patient_id = p.patient_id
            JOIN facility f ON a.facility_id = f.facility_id
            WHERE a.facility_id IN ({facility_ids}) AND a.alert_archive = 0
            ORDER BY a.alert_date_time DESC
            """
            all_alerts = db.fetch_all(query)
        else:
            # No filter parameter provided (shouldn't happen, but default to all)
            query = """
            SELECT a.alert_id, a.patient_id, a.alert_type, a.alert_date_time, a.facility_id,
                   p.patient_first_name, p.patient_last_name, f.facility_name
            FROM alert a
            JOIN patient p ON a.patient_id = p.patient_id
            JOIN facility f ON a.facility_id = f.facility_id
            WHERE a.alert_archive = 0
            ORDER BY a.alert_date_time DESC
            """
            all_alerts = db.fetch_all(query)
        
        # Convert datetime to string
        for alert in all_alerts:
            if isinstance(alert['alert_date_time'], datetime):
                if alert['alert_date_time'].date() == datetime.now().date():
                    alert['alert_date_time'] = alert['alert_date_time'].strftime('Today, %I:%M %p')
                else:
                    alert['alert_date_time'] = alert['alert_date_time'].strftime('%Y-%m-%d, %I:%M %p')
        
        # Pagination
        total = len(all_alerts)
        start = (page - 1) * per_page
        end = start + per_page
        alerts = all_alerts[start:end]
        
        return jsonify({
            'success': True,
            'alerts': alerts,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/activities')
@login_required
def get_activities():
    """Get admin activities"""
    try:
        admin_id = session.get('admin_id')
        activities = get_admin_activities(admin_id)
        return jsonify({'success': True, 'activities': activities})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/patient/<int:patient_id>')
@login_required
def get_patient_details(patient_id):
    """Get patient details"""
    try:
        patient = db.fetch_one(f"""
            SELECT p.*, f.facility_name, f.facility_email,
                   ph.physician_first_name, ph.physician_last_name, ph.physician_email
            FROM patient p
            LEFT JOIN facility f ON p.facility_id = f.facility_id
            LEFT JOIN physician ph ON p.physician_id = ph.physician_id
            WHERE p.patient_id = {patient_id}
        """)
        
        if not patient:
            return jsonify({'success': False, 'message': 'Patient not found'})
        
        # Convert date to string
        if patient.get('patient_dob'):
            patient['patient_dob'] = patient['patient_dob'].strftime('%m/%d/%Y')
            patient['patient_age'] = datetime.now().year - datetime.strptime(patient['patient_dob'], '%m/%d/%Y').year
        if patient.get('patient_admission_date'):
            patient['patient_admission_date'] = patient['patient_admission_date'].strftime('%m/%d/%Y')
        
        return jsonify({'success': True, 'patient': patient})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/alert/<int:alert_id>')
@login_required
def get_alert_details(alert_id):
    """Get alert details"""
    try:
        alert = db.fetch_one(f"SELECT * FROM alert WHERE alert_id = {alert_id}")
        
        if not alert:
            return jsonify({'success': False, 'message': 'Alert not found'})
        
        # Convert datetime to string
        if isinstance(alert.get('alert_date_time'), datetime):
            alert['alert_date_time'] = alert['alert_date_time'].strftime('%Y-%m-%d %I:%M %p')
        
        return jsonify({'success': True, 'alert': alert})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/recommendation/<int:alert_id>')
@login_required
def get_recommendation(alert_id):
    """Get AI recommendation for alert"""
    try:
        print(f"Fetching recommendation for alert_id: {alert_id}")
        
        # Get patient_id from database
        alert = db.fetch_one(f"SELECT patient_id FROM alert WHERE alert_id = {alert_id}")
        patient_id = alert.get('patient_id') if alert else None
        
        recommendation = get_recommendation_from_s3(alert_id, patient_id)
        if recommendation:
            print(f"✓ Recommendation found for alert {alert_id}")
            return jsonify({'success': True, 'recommendation': recommendation})
        else:
            print(f"⚠ Recommendation not found for alert {alert_id}")
            # List available files in S3 for debugging
            try:
                s3_client = boto3.client('s3', region_name=os.getenv('AWS_REGION', 'us-east-1'))
                bucket = os.getenv('RECOMMENDATION_BUCKET_NAME')
                response = s3_client.list_objects_v2(Bucket=bucket, Prefix=str(alert_id))
                if 'Contents' in response:
                    files = [obj['Key'] for obj in response['Contents']]
                    print(f"  Available files with prefix {alert_id}: {files}")
                else:
                    print(f"  No files found with prefix {alert_id}")
            except Exception as list_error:
                print(f"  Error listing S3 files: {list_error}")
            
            return jsonify({'success': False, 'message': f'Recommendation not found for alert {alert_id}'})
    except Exception as e:
        print(f"❌ Error fetching recommendation: {e}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/vitals/<int:patient_id>')
@login_required
def get_vitals(patient_id):
    """Get patient vitals"""
    try:
        vitals = db.fetch_all(f"""
            SELECT * FROM vitals_data 
            WHERE patient_id = {patient_id}
            ORDER BY vitals_date_time DESC 
            LIMIT 10
        """)
        
        # Convert datetime to string
        for vital in vitals:
            if isinstance(vital.get('vitals_date_time'), datetime):
                vital['vitals_date_time'] = vital['vitals_date_time'].strftime('%Y-%m-%d %I:%M %p')
        
        return jsonify({'success': True, 'vitals': vitals})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/medications/<int:patient_id>')
@login_required
def get_medications(patient_id):
    """Get patient medications"""
    try:
        medications = db.fetch_all(f"""
            SELECT * FROM medication 
            WHERE patient_id = {patient_id}
            ORDER BY medication_date_time DESC 
            LIMIT 10
        """)
        
        # Convert datetime to string
        for med in medications:
            if isinstance(med.get('medication_date_time'), datetime):
                med['medication_date_time'] = med['medication_date_time'].strftime('%Y-%m-%d %I:%M %p')
        
        return jsonify({'success': True, 'medications': medications})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/labs/<int:patient_id>')
@login_required
def get_labs(patient_id):
    """Get patient lab results"""
    try:
        labs = db.fetch_all(f"""
            SELECT * FROM lab_result 
            WHERE patient_id = {patient_id}
            ORDER BY lab_date_time DESC 
            LIMIT 10
        """)
        
        # Convert datetime to string
        for lab in labs:
            if isinstance(lab.get('lab_date_time'), datetime):
                lab['lab_date_time'] = lab['lab_date_time'].strftime('%Y-%m-%d %I:%M %p')
        
        return jsonify({'success': True, 'labs': labs})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/send-email', methods=['POST'])
@login_required
def send_email():
    """Send email to care team"""
    try:
        data = request.get_json()
        recipients = data.get('recipients', [])
        subject = data.get('subject', '')
        message = data.get('message', '')
        patient_name = data.get('patient_name', '')
        
        success, msg_id = send_email_ses(recipients, subject, message)
        
        if success:
            # Log activity
            admin_id = session.get('admin_id')
            log_admin_activity(admin_id, f"You sent recommendation for {patient_name}")
            
            return jsonify({'success': True, 'message': 'Email sent successfully'})
        else:
            return jsonify({'success': False, 'message': f'Failed to send email: {msg_id}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/log-review', methods=['POST'])
@login_required
def log_review():
    """Log alert review activity"""
    try:
        data = request.get_json()
        patient_name = data.get('patient_name', '')
        
        admin_id = session.get('admin_id')
        log_admin_activity(admin_id, f"You reviewed alert for {patient_name}")
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/archive-alert', methods=['POST'])
@login_required
def archive_alert():
    """Archive an alert"""
    try:
        data = request.get_json()
        alert_id = data.get('alert_id')
        patient_name = data.get('patient_name', '')
        
        if not alert_id:
            return jsonify({'success': False, 'message': 'Alert ID is required'})
        
        # Update alert_archive to 1
        db.execute_query(f"""
            UPDATE alert 
            SET alert_archive = 1 
            WHERE alert_id = {alert_id}
        """)
        
        # Log activity
        admin_id = session.get('admin_id')
        log_admin_activity(admin_id, f"You archived alert for {patient_name}")
        
        return jsonify({'success': True, 'message': 'Alert archived successfully'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/archived-alerts')
@login_required
def get_archived_alerts():
    """Get archived alerts with optional facility filter"""
    try:
        facility_ids = request.args.get('facilities', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 6))
        
        # If facility_ids is empty string, return no alerts (user unchecked all)
        if facility_ids == '':
            all_alerts = []
        elif facility_ids:
            # Specific facilities selected
            query = f"""
            SELECT a.alert_id, a.patient_id, a.alert_type, a.alert_date_time, a.facility_id,
                   p.patient_first_name, p.patient_last_name, f.facility_name
            FROM alert a
            JOIN patient p ON a.patient_id = p.patient_id
            JOIN facility f ON a.facility_id = f.facility_id
            WHERE a.facility_id IN ({facility_ids}) AND a.alert_archive = 1
            ORDER BY a.alert_date_time DESC
            """
            all_alerts = db.fetch_all(query)
        else:
            # No filter parameter provided (shouldn't happen, but default to all)
            query = """
            SELECT a.alert_id, a.patient_id, a.alert_type, a.alert_date_time, a.facility_id,
                   p.patient_first_name, p.patient_last_name, f.facility_name
            FROM alert a
            JOIN patient p ON a.patient_id = p.patient_id
            JOIN facility f ON a.facility_id = f.facility_id
            WHERE a.alert_archive = 1
            ORDER BY a.alert_date_time DESC
            """
            all_alerts = db.fetch_all(query)
        
        # Convert datetime to string
        for alert in all_alerts:
            if isinstance(alert['alert_date_time'], datetime):
                if alert['alert_date_time'].date() == datetime.now().date():
                    alert['alert_date_time'] = alert['alert_date_time'].strftime('Today, %I:%M %p')
                else:
                    alert['alert_date_time'] = alert['alert_date_time'].strftime('%Y-%m-%d, %I:%M %p')
        
        # Pagination
        total = len(all_alerts)
        start = (page - 1) * per_page
        end = start + per_page
        alerts = all_alerts[start:end]
        
        return jsonify({
            'success': True,
            'alerts': alerts,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/check-new-alerts')
@login_required
def check_new_alerts():
    """Check if there are new alerts in the last 5 minutes"""
    try:
        result = db.fetch_one("""
            SELECT COUNT(*) as count 
            FROM alert 
            WHERE alert_date_time >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND alert_archive = 0
        """)
        
        has_new_alerts = result['count'] > 0 if result else False
        
        return jsonify({
            'success': True,
            'has_new_alerts': has_new_alerts,
            'count': result['count'] if result else 0
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

def check_new_entries_and_generate_alerts():
    """Background task to check for new entries and generate alerts"""
    print("🔍 Care coordination monitoring started - checking every minute for new entries...")
    
    while True:
        try:
            time.sleep(60)  # Check every minute
            
            thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S')
            
            # Find all patients with data in last 30 days
            patients_to_check = set()
            
            # Check vitals_data
            vitals_patients = db.fetch_all(f"""
                SELECT DISTINCT patient_id FROM vitals_data 
                WHERE vitals_date_time >= '{thirty_days_ago}'
            """)
            for row in vitals_patients:
                patients_to_check.add(row['patient_id'])
            
            # Check lab_result
            lab_patients = db.fetch_all(f"""
                SELECT DISTINCT patient_id FROM lab_result 
                WHERE lab_date_time >= '{thirty_days_ago}'
            """)
            for row in lab_patients:
                patients_to_check.add(row['patient_id'])
            
            # Check medication
            med_patients = db.fetch_all(f"""
                SELECT DISTINCT patient_id FROM medication 
                WHERE medication_date_time >= '{thirty_days_ago}'
            """)
            for row in med_patients:
                patients_to_check.add(row['patient_id'])
            
            if patients_to_check:
                print(f"✓ Found {len(patients_to_check)} patients with data in last 30 days: {patients_to_check}")
                
                # Process each patient
                for patient_id in patients_to_check:
                    try:
                        process_patient_alert(patient_id)
                    except Exception as e:
                        print(f"Error processing patient {patient_id}: {e}")
            
        except Exception as e:
            print(f"Error in care coordination monitoring: {e}")
            import traceback
            traceback.print_exc()

def process_patient_alert(patient_id):
    """Process alert for a specific patient using eval table tracking"""
    print(f"📊 Analyzing patient {patient_id}...")
    
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S')
    
    # Fetch last 30 days of data using database client
    vitals = db.fetch_all(f"""
        SELECT * FROM vitals_data 
        WHERE patient_id = {patient_id} AND vitals_date_time >= '{thirty_days_ago}'
        ORDER BY vitals_date_time DESC
    """)
    
    labs = db.fetch_all(f"""
        SELECT * FROM lab_result 
        WHERE patient_id = {patient_id} AND lab_date_time >= '{thirty_days_ago}'
        ORDER BY lab_date_time DESC
    """)
    
    meds = db.fetch_all(f"""
        SELECT * FROM medication 
        WHERE patient_id = {patient_id} AND medication_date_time >= '{thirty_days_ago}'
        ORDER BY medication_date_time DESC
    """)
    
    if not vitals and not labs and not meds:
        print(f"  ⚠ No data found for patient {patient_id}")
        return
    
    # Get latest timestamps from each table
    latest_vitals_time = vitals[0]['vitals_date_time'] if vitals else None
    latest_lab_time = labs[0]['lab_date_time'] if labs else None
    latest_med_time = meds[0]['medication_date_time'] if meds else None
    
    # Get last evaluated timestamps from eval table
    eval_record = db.fetch_one(f"""
        SELECT lab_last_date_time, medication_last_date_time, vitals_last_date_time 
        FROM eval 
        WHERE patient_id = {patient_id}
    """)
    
    # Check if any table has new entries
    has_new_entry = False
    
    # Debug: Print what we're comparing
    print(f"  🔍 Latest timestamps - Vitals: {latest_vitals_time}, Labs: {latest_lab_time}, Meds: {latest_med_time}")
    if eval_record:
        print(f"  🔍 Eval table - Vitals: {eval_record.get('vitals_last_date_time')}, Labs: {eval_record.get('lab_last_date_time')}, Meds: {eval_record.get('medication_last_date_time')}")
    else:
        print(f"  🔍 No eval record exists for patient {patient_id}")
    
    if latest_vitals_time:
        eval_vitals_time = eval_record.get('vitals_last_date_time') if eval_record else None
        # Treat invalid dates (0000-00-00) as None
        if isinstance(eval_vitals_time, str) or not eval_vitals_time:
            eval_vitals_time = None
        if not eval_vitals_time or latest_vitals_time > eval_vitals_time:
            has_new_entry = True
            print(f"  ✓ New vitals entry detected: {latest_vitals_time}")
    
    if latest_lab_time:
        eval_lab_time = eval_record.get('lab_last_date_time') if eval_record else None
        # Treat invalid dates (0000-00-00) as None
        if isinstance(eval_lab_time, str) or not eval_lab_time:
            eval_lab_time = None
        if not eval_lab_time or latest_lab_time > eval_lab_time:
            has_new_entry = True
            print(f"  ✓ New lab entry detected: {latest_lab_time}")
    
    if latest_med_time:
        eval_med_time = eval_record.get('medication_last_date_time') if eval_record else None
        # Treat invalid dates (0000-00-00) as None
        if isinstance(eval_med_time, str) or not eval_med_time:
            eval_med_time = None
        if not eval_med_time or latest_med_time > eval_med_time:
            has_new_entry = True
            print(f"  ✓ New medication entry detected: {latest_med_time}")
    
    # If no new entries, skip processing
    if not has_new_entry:
        print(f"  ℹ️  No new entries detected for patient {patient_id}")
        return
    
    print(f"  🔄 Processing new entries for patient {patient_id}...")
    
    # Analyze with Bedrock
    alert_type, alert_detail = analyze_with_bedrock(patient_id, vitals, labs, meds)
    
    if not alert_type or not alert_detail:
        print(f"  ✓ No abnormalities detected for patient {patient_id}")
        # Update eval table even if no alert (to track that we evaluated this data)
        vitals_time_str = f"'{latest_vitals_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_vitals_time else 'NULL'
        lab_time_str = f"'{latest_lab_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_lab_time else 'NULL'
        med_time_str = f"'{latest_med_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_med_time else 'NULL'
        
        if eval_record:
            db.execute_query(f"""
                UPDATE eval 
                SET vitals_last_date_time = {vitals_time_str},
                    lab_last_date_time = {lab_time_str},
                    medication_last_date_time = {med_time_str}
                WHERE patient_id = {patient_id}
            """)
        else:
            db.execute_query(f"""
                INSERT INTO eval (patient_id, vitals_last_date_time, lab_last_date_time, medication_last_date_time)
                VALUES ({patient_id}, {vitals_time_str}, {lab_time_str}, {med_time_str})
            """)
        print(f"  ✓ Eval table updated (no alert needed)")
        return
    
    # Check if similar alert already exists for this patient (not archived)
    existing_alert = db.fetch_one(f"""
        SELECT alert_id, alert_type FROM alert 
        WHERE patient_id = {patient_id} 
        AND alert_archive = 0
        ORDER BY alert_date_time DESC 
        LIMIT 1
    """)
    
    if existing_alert:
        # Check if alert types are identical or very similar
        existing_type = existing_alert['alert_type'].lower()
        new_type = alert_type.lower()
        
        # Only skip if alerts are exactly the same or share 3+ significant keywords
        existing_keywords = set(word for word in existing_type.split() if len(word) > 3)
        new_keywords = set(word for word in new_type.split() if len(word) > 3)
        common_keywords = existing_keywords.intersection(new_keywords)
        
        # Only consider duplicate if exact match OR 3+ common significant keywords
        if existing_type == new_type or len(common_keywords) >= 3:
            print(f"  ℹ️  Similar alert already exists: '{existing_alert['alert_type']}'")
            print(f"  ℹ️  New alert would be: '{alert_type}'")
            print(f"  ℹ️  Skipping duplicate alert, updating eval table only")
            
            # Update eval table to track that we processed this data
            vitals_time_str = f"'{latest_vitals_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_vitals_time else 'NULL'
            lab_time_str = f"'{latest_lab_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_lab_time else 'NULL'
            med_time_str = f"'{latest_med_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_med_time else 'NULL'
            
            if eval_record:
                db.execute_query(f"""
                    UPDATE eval 
                    SET vitals_last_date_time = {vitals_time_str},
                        lab_last_date_time = {lab_time_str},
                        medication_last_date_time = {med_time_str}
                    WHERE patient_id = {patient_id}
                """)
            else:
                db.execute_query(f"""
                    INSERT INTO eval (patient_id, vitals_last_date_time, lab_last_date_time, medication_last_date_time)
                    VALUES ({patient_id}, {vitals_time_str}, {lab_time_str}, {med_time_str})
                """)
            print(f"  ✓ Eval table updated (duplicate alert prevented)")
            return
    
    # Get facility_id
    patient_info = db.fetch_one(f"SELECT facility_id FROM patient WHERE patient_id = {patient_id}")
    facility_id = patient_info['facility_id'] if patient_info else None
    
    # Escape single quotes in alert text to prevent SQL errors
    alert_type_escaped = alert_type.replace("'", "''")
    alert_detail_escaped = alert_detail.replace("'", "''")
    
    # Insert alert using database client with escaped text (alert_id will be auto-generated)
    try:
        # Get current timestamp for matching
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        db.execute_query(f"""
            INSERT INTO alert (patient_id, alert_type, alert_detail, facility_id, alert_date_time, alert_archive)
            VALUES ({patient_id}, '{alert_type_escaped}', '{alert_detail_escaped}', {facility_id}, '{current_time}', 0)
        """)
        
        # Get the alert we just inserted by matching patient_id and timestamp
        alert_result = db.fetch_one(f"""
            SELECT alert_id FROM alert 
            WHERE patient_id = {patient_id} 
            AND alert_date_time >= '{current_time}'
            ORDER BY alert_id DESC 
            LIMIT 1
        """)
        
        alert_id = alert_result['alert_id'] if alert_result else None
        
        if not alert_id:
            print(f"  ❌ Failed to get alert_id after insert")
            return
        
        print(f"  🚨 Alert created (ID: {alert_id}): {alert_type}")
        
        # Generate and save recommendation with new filename convention
        recommendation = generate_recommendation(patient_id, alert_type, alert_detail, vitals, labs, meds)
        save_recommendation_to_s3(alert_id, recommendation, patient_id)
        
        print(f"  ✓ Recommendation saved to S3 as {alert_id}_{patient_id}_recommendation.txt")
        
        # Update eval table with latest timestamps
        vitals_time_str = f"'{latest_vitals_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_vitals_time else 'NULL'
        lab_time_str = f"'{latest_lab_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_lab_time else 'NULL'
        med_time_str = f"'{latest_med_time.strftime('%Y-%m-%d %H:%M:%S')}'" if latest_med_time else 'NULL'
        
        if eval_record:
            # Update existing record
            db.execute_query(f"""
                UPDATE eval 
                SET vitals_last_date_time = {vitals_time_str},
                    lab_last_date_time = {lab_time_str},
                    medication_last_date_time = {med_time_str}
                WHERE patient_id = {patient_id}
            """)
        else:
            # Insert new record
            db.execute_query(f"""
                INSERT INTO eval (patient_id, vitals_last_date_time, lab_last_date_time, medication_last_date_time)
                VALUES ({patient_id}, {vitals_time_str}, {lab_time_str}, {med_time_str})
            """)
        
        print(f"  ✓ Eval table updated for patient {patient_id}")
        
    except Exception as e:
        print(f"  ❌ Error creating alert: {e}")
        # Don't update eval table if alert creation failed
        return

def analyze_with_bedrock(patient_id, vitals, labs, meds):
    """Analyze patient data with Bedrock LLM"""
    prompt = """You are an expert medical doctor specializing in geriatric care and clinical diagnostics. 

⚠️ CRITICAL REQUIREMENT: You MUST evaluate EVERY SINGLE parameter in the data provided. Do NOT skip any values.
⚠️ BE STRICT: Even slightly abnormal values MUST be flagged. If a value is outside the range by even 1 unit, FLAG IT.

EXAMPLES OF WHAT TO FLAG:
- BUN = 21 mg/dL → FLAG as "Elevated BUN (21 mg/dL)" because normal is 7-20
- BUN = 24 mg/dL → FLAG as "Elevated BUN (24 mg/dL)" because normal is 7-20
- Glucose = 141 mg/dL → FLAG as "High Glucose (141 mg/dL)" because normal is <140
- SpO2 = 94% → FLAG as "Low SpO2 (94%)" because normal is >95%
- Potassium = 5.1 mEq/L → FLAG as "High Potassium (5.1 mEq/L)" because normal is 3.5-5.0

YOUR TASK:
1. Go through EACH vital sign reading - check blood pressure, heart rate, temperature, SpO2, BMI
2. Go through EACH laboratory value - check sodium, potassium, BUN, creatinine, glucose
3. Go through EACH medication entry
4. Compare EVERY value against the normal ranges below
5. Report ALL abnormalities found - do not report only one, report EVERY abnormal value
6. BE STRICT - if a value is outside the range, FLAG IT immediately

NORMAL RANGES - Flag ANY value outside these ranges:

VITAL SIGNS:
- Blood Pressure: 90/60 to 120/80 mmHg → Flag if systolic >120 OR diastolic >80
- Heart Rate: 60-100 bpm → Flag if <60 OR >100
- Temperature: 97-99°F (36.1-37.2°C) → Flag if <97 OR >99
- SpO2: >95% → Flag if <95%
- BMI: 18.5-24.9 → Flag if <18.5 OR >24.9

LABORATORY VALUES (STRICT THRESHOLDS):
- Sodium: 135-145 mEq/L → Flag if <135 OR >145 (e.g., 146 is HIGH, 134 is LOW)
- Potassium: 3.5-5.0 mEq/L → Flag if <3.5 OR >5.0 (e.g., 5.1 is HIGH, 3.4 is LOW)
- BUN: 7-20 mg/dL → Flag if <7 OR >20 (e.g., 21 is HIGH, 24 is HIGH, 6 is LOW)
- Creatinine: 0.6-1.2 mg/dL → Flag if <0.6 OR >1.2 (e.g., 1.3 is HIGH, 0.5 is LOW)
- Glucose: 70-100 mg/dL (fasting), <140 mg/dL (non-fasting) → Flag if <70 OR >140 (e.g., 145 is HIGH, 65 is LOW)

STEP-BY-STEP PROCESS:
1. Read the vitals data - check EACH parameter (BP, HR, Temp, SpO2, BMI)
2. Read the labs data - check EACH parameter (Sodium, Potassium, BUN, Creatinine, Glucose)
3. List EVERY abnormal value you find
4. Create comprehensive alert listing ALL abnormalities

OUTPUT FORMAT:
If you find ANY abnormality, respond with:
ALERT: [List ALL abnormal findings with values]
DETAIL: [Detailed explanation of ALL abnormalities]

Example with multiple abnormalities:
ALERT: High Glucose (145 mg/dL), Low SpO2 (92%), Elevated Temperature (99.5°F)
DETAIL: Patient shows hyperglycemia with glucose at 145 mg/dL exceeding normal <140, hypoxemia with SpO2 at 92% below normal >95%, and fever with temperature at 99.5°F above normal <99°F.

If NO abnormalities found, respond with:
NO_ALERT

PATIENT DATA TO ANALYZE:
"""
    
    data_summary = f"""
PATIENT ID: {patient_id}
DATA PERIOD: Last 30 days

VITAL SIGNS ({len(vitals)} records):
{json.dumps(vitals[:10], default=str)}

LABORATORY RESULTS ({len(labs)} records):
{json.dumps(labs[:10], default=str)}

MEDICATIONS ({len(meds)} records):
{json.dumps(meds[:10], default=str)}

Analyze this data and identify any abnormalities or concerning patterns.
"""
    
    try:
        response = bedrock_runtime.invoke_model(
            modelId=os.getenv('BEDROCK_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0'),
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt + data_summary}]
            })
        )
        
        response_body = json.loads(response['body'].read())
        analysis = response_body['content'][0]['text']
        
        if "NO_ALERT" in analysis:
            return None, None
        
        alert_type = ""
        alert_detail = ""
        
        if "ALERT:" in analysis:
            lines = analysis.split('\n')
            for line in lines:
                if line.startswith("ALERT:"):
                    alert_type = line.replace("ALERT:", "").strip()
                elif line.startswith("DETAIL:"):
                    alert_detail = line.replace("DETAIL:", "").strip()
        
        return alert_type, alert_detail
        
    except Exception as e:
        print(f"  ❌ Error calling Bedrock: {e}")
        return None, None

def generate_recommendation(patient_id, alert_type, alert_detail, vitals, labs, meds):
    """Generate clinical recommendation"""
    prompt = """You are an expert medical doctor providing clinical recommendations.

RECOMMENDATION STRUCTURE:
1. Clinical Context: Brief summary
2. Potential Causes: List possible causes
3. Recommended Actions: Specific interventions
4. Follow-up: Timeline for reassessment

Keep recommendations professional, evidence-based, and actionable.

PATIENT ALERT:
"""
    
    context = f"""
PATIENT ID: {patient_id}

IDENTIFIED ALERT:
Type: {alert_type}
Details: {alert_detail}

RECENT CLINICAL DATA:
Vitals: {json.dumps(vitals[:5], default=str)}
Labs: {json.dumps(labs[:5], default=str)}
Medications: {json.dumps(meds[:10], default=str)}

Provide comprehensive clinical recommendations.
"""
    
    try:
        response = bedrock_runtime.invoke_model(
            modelId=os.getenv('BEDROCK_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0'),
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt + context}]
            })
        )
        
        response_body = json.loads(response['body'].read())
        return response_body['content'][0]['text']
        
    except Exception as e:
        print(f"  ❌ Error generating recommendation: {e}")
        return f"Error generating recommendation: {str(e)}"

def save_recommendation_to_s3(alert_id, recommendation, patient_id):
    """Save recommendation to S3 with patient_id in filename"""
    try:
        s3_client.put_object(
            Bucket=os.getenv('RECOMMENDATION_BUCKET_NAME'),
            Key=f"{alert_id}_{patient_id}_recommendation.txt",
            Body=recommendation.encode('utf-8')
        )
    except Exception as e:
        print(f"  ❌ Error saving to S3: {e}")

def start_care_coordination_monitoring():
    """Start the background care coordination monitoring thread"""
    # Only start in the main process (not in Flask reloader process)
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        monitor_thread = threading.Thread(target=check_new_entries_and_generate_alerts, daemon=True)
        monitor_thread.start()

# ============ CHATBOT ENDPOINTS ============

@app.route('/api/chatbot/patients')
@login_required
def get_patients_for_chatbot():
    """Get list of patients for chatbot upload using database client"""
    try:
        # Use existing database client
        patients = db.fetch_all("""
            SELECT patient_id, patient_first_name, patient_last_name
            FROM patient
            ORDER BY patient_last_name, patient_first_name
        """)
        return jsonify({'success': True, 'patients': patients})
    except Exception as e:
        print(f"Error fetching patients: {e}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/chatbot/upload', methods=['POST'])
@login_required
def upload_to_knowledge_base():
    """Upload documents to Bedrock Knowledge Base S3 bucket"""
    try:
        if 'files' not in request.files:
            return jsonify({'success': False, 'message': 'No files provided'})
        
        files = request.files.getlist('files')
        category = request.form.get('category', 'internal-kb')
        patient_id = request.form.get('patient_id', '')
        
        if not files:
            return jsonify({'success': False, 'message': 'No files selected'})
        
        # Determine S3 prefix
        if category == 'patient' and patient_id:
            # Get patient info using database client
            patient = db.fetch_one(f"""
                SELECT patient_first_name, patient_last_name 
                FROM patient 
                WHERE patient_id = {patient_id}
            """)
            if not patient:
                return jsonify({'success': False, 'message': 'Patient not found'})
            
            # Create folder name: firstname_lastname_id
            folder_name = f"{patient['patient_first_name']}_{patient['patient_last_name']}_{patient_id}".lower().replace(' ', '_')
            s3_prefix = f"{folder_name}/"
        else:
            s3_prefix = "internal-kb/"
        
        # Upload files to S3
        bucket_name = os.getenv('BEDROCK_KNOWLEDGE_BUCKET_NAME')
        uploaded_files = []
        
        for file in files:
            if file.filename:
                # Keep original filename
                s3_key = s3_prefix + file.filename
                
                # Upload to S3
                s3_client.put_object(
                    Bucket=bucket_name,
                    Key=s3_key,
                    Body=file.read()
                )
                uploaded_files.append(s3_key)
        
        # Sync data source twice with 10 second delay
        knowledge_base_id = os.getenv('BEDROCK_KNOWLEDGE_ID')
        data_source_id = os.getenv('BEDROCK_KNOWLEDGE_DATA_SOURCE_ID')
        
        bedrock_agent = boto3.client('bedrock-agent', region_name=os.getenv('AWS_REGION'))
        
        # First sync
        bedrock_agent.start_ingestion_job(
            knowledgeBaseId=knowledge_base_id,
            dataSourceId=data_source_id
        )
        
        # Wait 10 seconds
        time.sleep(10)
        
        # Second sync
        bedrock_agent.start_ingestion_job(
            knowledgeBaseId=knowledge_base_id,
            dataSourceId=data_source_id
        )
        
        return jsonify({
            'success': True,
            'message': f'Uploaded {len(uploaded_files)} file(s) and synced knowledge base',
            'files': uploaded_files
        })
        
    except Exception as e:
        print(f"Error uploading to KB: {e}")
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/chatbot/query', methods=['POST'])
@login_required
def query_knowledge_base():
    """Query Bedrock Knowledge Base"""
    try:
        data = request.get_json()
        question = data.get('question', '')
        
        print(f"📝 Chatbot question received: {question}")
        
        if not question:
            return jsonify({'success': False, 'message': 'No question provided'})
        
        # Query Bedrock Knowledge Base
        print(f"🔍 Querying KB ID: {os.getenv('BEDROCK_KNOWLEDGE_ID')}")
        print(f"🔍 Using model: {os.getenv('BEDROCK_MODEL_ID')}")
        
        bedrock_agent_runtime = boto3.client('bedrock-agent-runtime', region_name=os.getenv('AWS_REGION'))
        
        response = bedrock_agent_runtime.retrieve_and_generate(
            input={'text': question},
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': os.getenv('BEDROCK_KNOWLEDGE_ID'),
                    'modelArn': f"arn:aws:bedrock:{os.getenv('AWS_REGION')}::foundation-model/{os.getenv('BEDROCK_MODEL_ID')}"
                }
            }
        )
        
        print(f"✅ KB response received")
        print(f"📄 Full response: {json.dumps(response, default=str)}")
        
        answer = response.get('output', {}).get('text', 'No response from knowledge base')
        
        # Check if KB returned a meaningful answer
        if not answer or "unable to assist" in answer.lower():
            answer = "I don't have any information in my knowledge base yet. Please upload documents first using the upload section above."
        
        return jsonify({
            'success': True,
            'answer': answer
        })
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"❌ Error querying KB: {e}")
        print(f"Full traceback:\n{error_details}")
        return jsonify({'success': False, 'message': f"Error: {str(e)}"})


if __name__ == '__main__':
    # Start background care coordination monitoring
    start_care_coordination_monitoring()
    
    # Start Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)
