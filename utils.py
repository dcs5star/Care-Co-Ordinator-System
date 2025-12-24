"""
Utility functions for S3, SES, and database operations
"""
import boto3
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# AWS clients
s3_client = boto3.client('s3', region_name=os.getenv('AWS_REGION'))
ses_client = boto3.client('ses', region_name=os.getenv('AWS_REGION'))

def get_admin_activities(admin_id):
    """Fetch admin activity history from S3"""
    try:
        bucket = os.getenv('ADMIN_ACTIVITY_BUCKET_NAME')
        key = f"{admin_id}.txt"
        
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        
        # Parse activities (each line is an activity)
        activities = []
        for line in content.strip().split('\n'):
            if line:
                activities.append(line)
        
        # Return last 10 activities in reverse order (newest first)
        return list(reversed(activities[-10:]))
    except s3_client.exceptions.NoSuchKey:
        return []
    except Exception as e:
        print(f"Error fetching activities: {e}")
        return []

def log_admin_activity(admin_id, activity):
    """Log admin activity to S3"""
    try:
        bucket = os.getenv('ADMIN_ACTIVITY_BUCKET_NAME')
        key = f"{admin_id}.txt"
        
        timestamp = datetime.now().strftime('%Y-%m-%d %I:%M %p')
        activity_line = f"{activity} - {timestamp}\n"
        
        # Try to get existing content
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            existing_content = response['Body'].read().decode('utf-8')
        except s3_client.exceptions.NoSuchKey:
            existing_content = ""
        
        # Append new activity
        new_content = existing_content + activity_line
        
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=new_content.encode('utf-8')
        )
        
        return True
    except Exception as e:
        print(f"Error logging activity: {e}")
        return False

def get_recommendation_from_s3(alert_id, patient_id=None):
    """Fetch recommendation text from S3 - tries new format first, falls back to old format"""
    try:
        bucket = os.getenv('RECOMMENDATION_BUCKET_NAME')
        
        # Try new format with patient_id if provided
        if patient_id:
            key = f"{alert_id}_{patient_id}_recommendation.txt"
            print(f"  Fetching from S3: s3://{bucket}/{key}")
            try:
                response = s3_client.get_object(Bucket=bucket, Key=key)
                content = response['Body'].read().decode('utf-8')
                print(f"  ✓ Successfully fetched recommendation ({len(content)} bytes)")
                return content
            except s3_client.exceptions.NoSuchKey:
                print(f"  ⚠ New format not found, trying old format...")
        
        # Fall back to old format (for backward compatibility)
        key = f"{alert_id}_recommendation.txt"
        print(f"  Fetching from S3: s3://{bucket}/{key}")
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        print(f"  ✓ Successfully fetched recommendation ({len(content)} bytes)")
        return content
    except s3_client.exceptions.NoSuchKey:
        print(f"  ❌ File not found: s3://{bucket}/{key}")
        return None
    except Exception as e:
        print(f"  ❌ Error fetching recommendation: {e}")
        return None

def save_recommendation_to_s3(alert_id, recommendation_text, patient_id):
    """Save recommendation text to S3 with patient_id in filename"""
    try:
        bucket = os.getenv('RECOMMENDATION_BUCKET_NAME')
        key = f"{alert_id}_{patient_id}_recommendation.txt"
        
        print(f"  Saving to S3: s3://{bucket}/{key}")
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=recommendation_text.encode('utf-8')
        )
        print(f"  ✓ Successfully saved recommendation ({len(recommendation_text)} bytes)")
        
        return True
    except Exception as e:
        print(f"  ❌ Error saving recommendation: {e}")
        return False

def send_email_ses(to_emails, subject, body, attachments=None):
    """Send email via AWS SES"""
    try:
        sender = os.getenv('SES_SENDER_EMAIL')
        
        # For simplicity, sending text email without attachments
        # Full attachment support would require MIME multipart
        response = ses_client.send_email(
            Source=sender,
            Destination={'ToAddresses': to_emails},
            Message={
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': {'Text': {'Data': body, 'Charset': 'UTF-8'}}
            }
        )
        
        return True, response['MessageId']
    except Exception as e:
        print(f"Error sending email: {e}")
        return False, str(e)
