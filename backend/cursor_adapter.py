import os
import subprocess
import requests

def get_cursor_key():
    # Read from macOS Keychain using security CLI
    try:
        out = subprocess.check_output(["security","find-generic-password","-a","openclaw","-s","CURSOR_API_KEY","-w"], stderr=subprocess.DEVNULL)
        return out.decode().strip()
    except Exception:
        return None

def call_cursor(text):
    """Placeholder: call Cursor realtime/model API with given text.
    This function expects CURSOR_API_KEY in Keychain under service CURSOR_API_KEY and account openclaw.
    """
    key = get_cursor_key()
    if not key:
        raise RuntimeError('Cursor API key not found in Keychain')
    url = 'https://api.cursor.com/v1/generate'  # example placeholder
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'input': text}
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {'error': str(e)}

if __name__ == '__main__':
    print(call_cursor('hello from nara'))
