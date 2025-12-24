# Care Co-Ordinator System

A Flask-based care coordination system with AI-powered analysis using AWS Bedrock and Knowledge Base integration.

## Features

### 1. Care Coordination System
- **Real-time monitoring** of patient vitals, lab results, and medications
- **AI-powered analysis** using AWS Bedrock Claude model
- **Automatic alert generation** when abnormalities are detected
- **Duplicate prevention** - tracks evaluated data per patient
- **Archive functionality** - organize alerts efficiently

### 2. Dashboard
- **Three-panel layout**: Facility Filter | Alert Dashboard | Chatbot
- **Active alerts** with review and archive options
- **Archived alerts** section for historical reference
- **Recent activity** tracking for administrators
- **Real-time notifications** for new alerts with sound
- **Patient detail views** with clinical data tabs
- **Email integration** for care team communication

### 3. AI Chatbot
- **Knowledge Base integration** using AWS Bedrock
- **Document upload** to Internal KB or patient-specific folders
- **Patient-specific queries** with folder-based organization
- **Real-time chat** interface with typing indicators

## Setup

### Prerequisites
- Python 3.8+
- MySQL database
- AWS account with Bedrock access
- AWS S3 buckets configured

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment variables in `.env` (copy from `.env.example`):
```
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_KNOWLEDGE_ID=your_kb_id
BEDROCK_KNOWLEDGE_DATA_SOURCE_ID=your_data_source_id
BEDROCK_KNOWLEDGE_BUCKET_NAME=your_kb_bucket

RDS_HOST=your_db_host
RDS_PORT=3306
RDS_USER=your_db_user
RDS_PASS=your_db_password
RDS_DB=your_database

RECOMMENDATION_BUCKET_NAME=your_recommendation_bucket
ADMIN_ACTIVITY_BUCKET_NAME=your_activity_bucket
SES_SENDER_EMAIL=your_email@example.com
FLASK_SECRET_KEY=your_secret_key
```

3. **Generate a secure Flask secret key**:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

4. Set up database:
```bash
mysql -u your_user -p your_database < create_eval_table.sql
```

4. Run the application:
```bash
python app_flask.py
```

5. Access the dashboard:
```
http://localhost:5000
```

## Database Schema

### Key Tables
- **patient**: Patient information
- **vitals_data**: Vital signs (BP, HR, SpO2, etc.)
- **lab_result**: Laboratory test results
- **medication**: Medication records
- **alert**: Generated alerts with archive status
- **eval**: Tracks last evaluated timestamps per patient
- **facility**: Healthcare facilities
- **physician**: Physician information
- **admin**: Administrator accounts

## Architecture

### Alert Generation Flow
1. Background monitor checks every 60 seconds
2. Compares latest data timestamps with eval table
3. If new data detected, sends last 30 days to Bedrock
4. AI analyzes and generates alerts for abnormalities
5. Saves recommendations to S3
6. Updates eval table with latest timestamps

### Chatbot Flow
1. Documents uploaded to S3 (internal-kb/ or patient folders)
2. Knowledge Base synced automatically
3. User queries sent to Bedrock with KB context
4. AI responds based only on uploaded documents

## S3 Structure

```
your-kb-bucket/
├── internal-kb/
│   └── [general documents]
└── {firstname}_{lastname}_{patientid}/
    └── [patient-specific documents]

your-recommendation-bucket/
└── {alert_id}_{patient_id}_recommendation.txt

your-admin-activity-bucket/
└── {admin_id}.txt
```

## Key Files

- `app_flask.py` - Main Flask application
- `utils.py` - Utility functions (S3, SES, database)
- `create_eval_table.sql` - Database setup script
- `static/js/dashboard.js` - Frontend JavaScript
- `static/css/styles.css` - Styling
- `templates/dashboard.html` - Main dashboard template
- `templates/login.html` - Admin login page

## Features in Detail

### Care Coordination System
- Strict threshold checking for all vital signs and lab values
- Independent tracking per data source (vitals, labs, meds)
- Prevents duplicate alerts for same condition using keyword matching
- Archives old alerts to keep dashboard clean
- Real-time popup notifications for new alerts
- Email notifications to care team with clinical recommendations
- Background monitoring thread runs independently of web interface

### Chatbot
- Upload PDFs, DOCX, TXT files to S3 knowledge base
- Automatic KB synchronization (twice with 10s delay)
- Patient folder naming: `firstname_lastname_id`
- Answers only from uploaded documents (no general knowledge)
- Real-time typing indicators and message timestamps
- Toggle-able chatbot panel interface

## Development

The application uses:
- **Flask** for web framework
- **boto3** for AWS services
- **pymysql** for database connectivity
- **python-dotenv** for environment variable management
- **Bootstrap 5** for UI components
- **JavaScript** for frontend interactivity

## Security Considerations

⚠️ **IMPORTANT**: This project contains several security considerations that must be addressed before deployment:

### Before GitHub Upload:
1. **Never commit the `.env` file** - It contains sensitive credentials
2. **Use `.env.example`** - Copy and rename to `.env`, then fill with your actual values
3. **Review all code** - Ensure no hardcoded credentials or sensitive data

### SQL Injection Prevention:
The current codebase uses string formatting for SQL queries which creates SQL injection vulnerabilities. Before production use:
1. Replace all f-string SQL queries with parameterized queries
2. Use prepared statements with parameter binding
3. Validate and sanitize all user inputs

### Production Security:
- Use strong, unique passwords for all accounts
- Enable AWS IAM roles instead of access keys where possible
- Implement proper input validation and sanitization
- Use HTTPS in production
- Regularly update dependencies
- Implement proper logging and monitoring

## Additional Features

### Security & Authentication
- Admin login system with session management
- Secure password-based authentication
- Session-based access control for all endpoints

### Real-time Monitoring
- Background thread monitors for new data every 60 seconds
- Frontend polls for new alerts and updates display automatically
- Audio notifications for critical alerts

### Data Management
- Comprehensive patient data tracking (vitals, labs, medications)
- Facility-based filtering and organization
- Historical data archiving and retrieval

### AWS Integration
- **Bedrock**: AI analysis and knowledge base queries
- **S3**: Document storage and recommendation archiving
- **SES**: Email notifications to care teams
- **Bedrock Agent**: Knowledge base synchronization

## API Endpoints

### Authentication
- `GET /` - Redirect to login or dashboard
- `GET /login` - Admin login page
- `POST /login` - Process login credentials
- `GET /logout` - Logout and clear session

### Dashboard
- `GET /dashboard` - Main dashboard interface
- `GET /api/facilities` - Get all facilities
- `GET /api/alerts` - Get active alerts with pagination
- `GET /api/archived-alerts` - Get archived alerts
- `GET /api/activities` - Get admin activity history

### Patient Data
- `GET /api/patient/<id>` - Get patient details
- `GET /api/alert/<id>` - Get alert details
- `GET /api/recommendation/<id>` - Get AI recommendation
- `GET /api/vitals/<id>` - Get patient vitals
- `GET /api/medications/<id>` - Get patient medications
- `GET /api/labs/<id>` - Get patient lab results

### Alert Management
- `POST /api/archive-alert` - Archive an alert
- `POST /api/send-email` - Send email to care team
- `POST /api/log-review` - Log alert review activity
- `GET /api/check-new-alerts` - Check for new alerts

### Chatbot
- `GET /api/chatbot/patients` - Get patients for chatbot
- `POST /api/chatbot/upload` - Upload documents to knowledge base
- `POST /api/chatbot/query` - Query knowledge base

## License

Proprietary - All rights reserved