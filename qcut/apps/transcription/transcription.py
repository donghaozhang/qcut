import modal
from pydantic import BaseModel, Field

app = modal.App("opencut-transcription")

class TranscribeRequest(BaseModel):
    filename: str
    language: str = "auto"
    decryption_key: str | None = Field(default=None, alias="decryptionKey")
    iv: str | None = Field(default=None, alias="iv")

@app.function(
    image=modal.Image.debian_slim()
        .apt_install(["ffmpeg"])
        .pip_install(["openai-whisper", "boto3", "fastapi[standard]", "pydantic", "cryptography"]),
    gpu="A10G",
    timeout=300, # 5m
    secrets=[modal.Secret.from_name("opencut-r2-secrets")]
)
@modal.fastapi_endpoint(method="POST")
def transcribe_audio(request: TranscribeRequest):
    import whisper
    import boto3
    import tempfile
    import os
    import json
    
    try:
        filename = request.filename
        language = request.language
        decryption_key = request.decryption_key
        iv = request.iv
        
        if not filename:
            return {
                "error": "Missing filename parameter"
            }
        
        # Initialize R2 client
        s3_client = boto3.client(
            's3',
            endpoint_url=f'https://{os.environ["CLOUDFLARE_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name='auto'
        )
        
        # Create temporary file for audio
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            temp_path = temp_file.name
            
            try:
                # Download audio from R2
                s3_client.download_file(
                    os.environ["R2_BUCKET_NAME"], 
                    filename, 
                    temp_path
                )
                
                # If decryption key provided, decrypt the file directly (zero-knowledge)
                if decryption_key and iv:
                    import base64
                    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
                    from cryptography.hazmat.backends import default_backend
                    
                    # Read the encrypted file
                    with open(temp_path, 'rb') as f:
                        encrypted_data = f.read()
                    
                    # Decode the key and IV from base64
                    key_bytes = base64.b64decode(decryption_key)
                    iv_bytes = base64.b64decode(iv)
                    
                    # Decrypt the data using AES-GCM
                    # Extract the tag (last 16 bytes) and ciphertext
                    tag = encrypted_data[-16:]
                    ciphertext = encrypted_data[:-16]
                    
                    cipher = Cipher(
                        algorithms.AES(key_bytes),
                        modes.GCM(iv_bytes, tag),
                        backend=default_backend()
                    )
                    decryptor = cipher.decryptor()
                    decrypted_data = decryptor.update(ciphertext) + decryptor.finalize()
                    
                    # Write decrypted audio back to temp file
                    with open(temp_path, 'wb') as f:
                        f.write(decrypted_data)
                
                # Load Whisper model
                model_name = os.environ.get("WHISPER_MODEL", "base")
                model = whisper.load_model(model_name)
                
                # Transcribe audio
                if language == "auto":
                    result = model.transcribe(temp_path)
                else:
                    result = model.transcribe(temp_path, language=language.lower())
                
                # Delete audio file from R2 (cleanup)
                s3_client.delete_object(
                    Bucket=os.environ["R2_BUCKET_NAME"],
                    Key=filename
                )
                
                # Adjust segment timing - Whisper is consistently late by ~500ms
                SEGMENT_TIME_ADJUSTMENT_SEC = 0.5
                adjusted_segments = []
                for segment in result["segments"]:
                    adjusted_segment = segment.copy()
                    # Shift start/end times earlier by the adjustment offset, don't go below 0
                    adjusted_segment["start"] = max(0, segment["start"] - SEGMENT_TIME_ADJUSTMENT_SEC)
                    adjusted_segment["end"] = max(SEGMENT_TIME_ADJUSTMENT_SEC, segment["end"] - SEGMENT_TIME_ADJUSTMENT_SEC)  # Ensure duration is at least the adjustment value
                    adjusted_segments.append(adjusted_segment)
                
                return {
                    "text": result["text"],
                    "segments": adjusted_segments,
                    "language": result["language"]
                }
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
                    
    except Exception as e:
        import traceback
        # Log the full error for internal debugging
        print(f"Transcription error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        
        # Return a generic error response to the client
        return {
            "error": "An unexpected error occurred during transcription.",
            "text": "",
            "segments": [],
            "language": "unknown"
        }

@app.local_entrypoint()
def main():
    # Test function - you can call this with modal run transcription.py
    print("Transcription service is ready to deploy!")
    print("Deploy with: modal deploy transcription.py")