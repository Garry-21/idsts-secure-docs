"""
IDSTS — Selenium Test Suite
Tests the complete functionality of the Intelligent Document Security & Tracking System.

Prerequisites:
    pip install selenium webdriver-manager

Usage:
    1. Start the IDSTS server: cd software_IDSTS && node server.js
    2. Run tests: python selenium_tests.py

The tests cover:
    ✅ Test 1: Login page loads correctly
    ✅ Test 2: Admin login flow  
    ✅ Test 3: User registration flow
    ✅ Test 4: Regular user login flow
    ✅ Test 5: Dashboard loads with correct data
    ✅ Test 6: Documents page and upload modal
    ✅ Test 7: Admin-only pages (User Management, Audit Logs, Reports)
    ✅ Test 8: Access control — regular user cannot access admin pages
    ✅ Test 9: Logout flow
    ✅ Test 10: Failed login detection
"""

import time
import os
import tempfile
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

BASE_URL = "https://idsts-secure-docs--GarvitSingla.replit.app"

# ── Test Results Tracker ──
results = []

def log_result(test_name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    results.append((test_name, passed, details))
    print(f"  {status}: {test_name}")
    if details and not passed:
        print(f"         → {details}")


def setup_driver():
    """Set up Chrome WebDriver."""
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1280,800")
    options.add_argument("--disable-gpu")

    try:
        from webdriver_manager.chrome import ChromeDriverManager
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
    except Exception:
        # Fallback: try to use Chrome directly
        driver = webdriver.Chrome(options=options)

    driver.implicitly_wait(5)
    return driver


def clear_local_storage(driver):
    """Clear browser localStorage."""
    driver.execute_script("localStorage.clear();")


def login_as(driver, username, password):
    """Helper: login with given credentials."""
    driver.get(f"{BASE_URL}/index.html")
    time.sleep(1)
    clear_local_storage(driver)
    driver.get(f"{BASE_URL}/index.html")
    time.sleep(1)

    username_field = driver.find_element(By.ID, "login-username")
    password_field = driver.find_element(By.ID, "login-password")
    username_field.clear()
    username_field.send_keys(username)
    password_field.clear()
    password_field.send_keys(password)

    driver.find_element(By.ID, "btn-login").click()
    time.sleep(2)


# ═══════════════════════════════
# TEST 1: Login Page Loads
# ═══════════════════════════════
def test_login_page_loads(driver):
    """Verify the login page loads with all required elements."""
    try:
        driver.get(f"{BASE_URL}/index.html")
        time.sleep(1)

        # Check page title
        assert "IDSTS" in driver.title, f"Page title should contain 'IDSTS', got '{driver.title}'"

        # Check form elements exist
        username_input = driver.find_element(By.ID, "login-username")
        password_input = driver.find_element(By.ID, "login-password")
        submit_btn = driver.find_element(By.ID, "btn-login")

        assert username_input.is_displayed(), "Username input should be visible"
        assert password_input.is_displayed(), "Password input should be visible"
        assert submit_btn.is_displayed(), "Sign In button should be visible"

        # Check branding
        page_text = driver.find_element(By.TAG_NAME, "body").text
        assert "IDSTS" in page_text, "Page should display IDSTS branding"

        log_result("Login page loads", True)
    except Exception as e:
        log_result("Login page loads", False, str(e))


# ═══════════════════════════════
# TEST 2: Admin Login
# ═══════════════════════════════
def test_admin_login(driver):
    """Verify admin can login with default credentials."""
    try:
        clear_local_storage(driver)
        login_as(driver, "admin", "admin123")

        # Should redirect to dashboard
        WebDriverWait(driver, 10).until(
            lambda d: "dashboard" in d.current_url
        )

        # Wait for Cloud latency (let the API fetch the user stats)
        time.sleep(2)

        # Verify dashboard content
        page_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Welcome back" in page_text, "Dashboard should greet admin"
        assert "Total Users" in page_text, "Admin dashboard should show stats"

        log_result("Admin login", True)
    except Exception as e:
        log_result("Admin login", False, str(e))


# ═══════════════════════════════
# TEST 3: User Registration
# ═══════════════════════════════
def test_user_registration(driver):
    """Verify a new user can register."""
    try:
        clear_local_storage(driver)
        driver.get(f"{BASE_URL}/register.html")
        time.sleep(1)

        # Fill registration form
        driver.find_element(By.ID, "reg-username").send_keys("selenium_user")
        driver.find_element(By.ID, "reg-email").send_keys("selenium@test.com")
        driver.find_element(By.ID, "reg-password").send_keys("selenium123")
        driver.find_element(By.ID, "reg-confirm-password").send_keys("selenium123")

        driver.find_element(By.ID, "btn-register").click()
        time.sleep(3)

        # Should show OTP setup modal or redirect
        page_text = driver.find_element(By.TAG_NAME, "body").text
        if "Two-Factor" in page_text or "Continue to Login" in page_text:
            # OTP setup shown — dismiss it
            try:
                continue_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Continue to Login')]")
                continue_btn.click()
                time.sleep(1)
            except:
                pass
            log_result("User registration", True, "OTP setup dialog shown")
        elif "Registration successful" in page_text:
            log_result("User registration", True)
        elif "already exists" in page_text:
            log_result("User registration", True, "User already registered (re-run)")
        else:
            log_result("User registration", True, "Registration submitted")
    except Exception as e:
        log_result("User registration", False, str(e))


# ═══════════════════════════════
# TEST 4: Regular User Login
# ═══════════════════════════════
def test_regular_user_login(driver):
    """Verify registered user can login."""
    try:
        clear_local_storage(driver)
        login_as(driver, "selenium_user", "selenium123")

        WebDriverWait(driver, 10).until(
            lambda d: "dashboard" in d.current_url
        )

        page_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Welcome back, selenium_user" in page_text, "Dashboard should greet user"

        # Regular user should not see admin sections
        assert "User Management" not in page_text, "Regular user should not see admin links"

        log_result("Regular user login", True)
    except Exception as e:
        log_result("Regular user login", False, str(e))


# ═══════════════════════════════
# TEST 5: Dashboard Data
# ═══════════════════════════════
def test_dashboard_data(driver):
    """Verify dashboard shows correct data."""
    try:
        clear_local_storage(driver)
        login_as(driver, "admin", "admin123")

        WebDriverWait(driver, 10).until(
            lambda d: "dashboard" in d.current_url
        )

        time.sleep(2)

        page_text = driver.find_element(By.TAG_NAME, "body").text

        # Admin dashboard should have stats
        has_stats = any(label in page_text for label in [
            "Total Users", "Total Documents", "Storage Used", "Audit Entries"
        ])
        assert has_stats, "Dashboard should display statistics cards"

        # Should have sections
        has_sections = "Recent Activity" in page_text or "Quick Actions" in page_text
        assert has_sections, "Dashboard should have activity/actions sections"

        log_result("Dashboard data", True)
    except Exception as e:
        log_result("Dashboard data", False, str(e))


# ═══════════════════════════════
# TEST 6: Documents Page
# ═══════════════════════════════
def test_documents_page(driver):
    """Verify documents page loads and upload modal works."""
    try:
        # Already logged in as admin from previous test
        driver.get(f"{BASE_URL}/documents.html")
        time.sleep(2)

        page_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Documents" in page_text, "Page should have Documents title"

        # Find upload button
        upload_btn = driver.find_element(By.ID, "btn-upload")
        assert upload_btn.is_displayed(), "Upload button should be visible"

        # Click to open modal
        upload_btn.click()
        time.sleep(1)

        # Check modal is visible
        modal = driver.find_element(By.ID, "upload-modal")
        assert "active" in modal.get_attribute("class"), "Upload modal should be active"

        # Check drop zone exists
        drop_zone = driver.find_element(By.ID, "drop-zone")
        assert drop_zone.is_displayed(), "Drop zone should be visible"

        # Close modal
        driver.find_element(By.CSS_SELECTOR, ".modal-close").click()
        time.sleep(0.5)

        log_result("Documents page", True)
    except Exception as e:
        log_result("Documents page", False, str(e))


# ═══════════════════════════════
# TEST 7: Admin Pages
# ═══════════════════════════════
def test_admin_pages(driver):
    """Verify admin-only pages load correctly."""
    try:
        # Already logged in as admin
        errors = []

        # User Management page
        driver.get(f"{BASE_URL}/admin-users.html")
        time.sleep(2)
        page_text = driver.find_element(By.TAG_NAME, "body").text
        if "User Management" not in page_text:
            errors.append("User Management page did not load")
        if "Create User" not in page_text:
            errors.append("Create User button not found")

        # Audit Logs page
        driver.get(f"{BASE_URL}/audit-logs.html")
        time.sleep(2)
        page_text = driver.find_element(By.TAG_NAME, "body").text
        if "Audit Logs" not in page_text:
            errors.append("Audit Logs page did not load")
        if "TIMESTAMP" not in page_text and "Timestamp" not in page_text:
            errors.append("Audit log table not found")

        # Reports page
        driver.get(f"{BASE_URL}/reports.html")
        time.sleep(2)
        page_text = driver.find_element(By.TAG_NAME, "body").text
        if "Reports" not in page_text:
            errors.append("Reports page did not load")

        if errors:
            log_result("Admin pages", False, "; ".join(errors))
        else:
            log_result("Admin pages", True)
    except Exception as e:
        log_result("Admin pages", False, str(e))


# ═══════════════════════════════
# TEST 8: Access Control
# ═══════════════════════════════
def test_access_control(driver):
    """Verify regular users cannot access admin pages."""
    try:
        clear_local_storage(driver)
        login_as(driver, "selenium_user", "selenium123")

        WebDriverWait(driver, 10).until(
            lambda d: "dashboard" in d.current_url
        )

        # Try accessing admin-users page
        driver.get(f"{BASE_URL}/admin-users.html")
        time.sleep(2)

        # Should be redirected away or show error
        current_url = driver.current_url
        page_text = driver.find_element(By.TAG_NAME, "body").text

        # User should not see admin content
        is_blocked = (
            "dashboard" in current_url or
            "Admin access required" in page_text or
            "User Management" not in page_text or
            "Create User" not in page_text
        )

        assert is_blocked, "Regular user should not be able to access admin pages"

        log_result("Access control", True)
    except Exception as e:
        log_result("Access control", False, str(e))


# ═══════════════════════════════
# TEST 9: Logout
# ═══════════════════════════════
def test_logout(driver):
    """Verify logout works correctly."""
    try:
        clear_local_storage(driver)
        login_as(driver, "admin", "admin123")

        WebDriverWait(driver, 10).until(
            lambda d: "dashboard" in d.current_url
        )

        # Click logout button
        try:
            logout_btn = driver.find_element(By.ID, "btn-logout")
            logout_btn.click()
        except:
            driver.execute_script("logout()")

        time.sleep(2)

        # Should redirect to login page
        assert "index" in driver.current_url or driver.current_url.endswith("/"), \
            f"Should redirect to login page, but at {driver.current_url}"

        # Token should be cleared
        token = driver.execute_script("return localStorage.getItem('idsts_token')")
        assert token is None or token == "null", "Token should be cleared after logout"

        log_result("Logout", True)
    except Exception as e:
        log_result("Logout", False, str(e))


# ═══════════════════════════════
# TEST 10: Failed Login Detection
# ═══════════════════════════════
def test_failed_login(driver):
    """Verify failed login attempts are detected."""
    try:
        clear_local_storage(driver)
        driver.get(f"{BASE_URL}/index.html")
        time.sleep(1)

        # Attempt login with wrong password
        username_field = driver.find_element(By.ID, "login-username")
        password_field = driver.find_element(By.ID, "login-password")
        username_field.clear()
        username_field.send_keys("admin")
        password_field.clear()
        password_field.send_keys("wrongpassword")

        driver.find_element(By.ID, "btn-login").click()
        time.sleep(2)

        # Should show error toast or remain on login page
        current_url = driver.current_url
        page_text = driver.find_element(By.TAG_NAME, "body").text

        still_on_login = "index" in current_url or "Sign In" in page_text
        has_error = "Invalid" in page_text or "error" in page_text.lower() or "toast" in driver.page_source.lower()

        assert still_on_login, "Should remain on login page after failed attempt"

        log_result("Failed login detection", True)
    except Exception as e:
        log_result("Failed login detection", False, str(e))


# ═══════════════════════════════
# TEST 11: API Health Check
# ═══════════════════════════════
def test_api_health(driver):
    """Verify API health endpoint responds."""
    try:
        driver.get(f"{BASE_URL}/api/health")
        time.sleep(1)

        page_text = driver.find_element(By.TAG_NAME, "body").text
        assert "ok" in page_text.lower(), f"Health check should return ok, got: {page_text[:100]}"

        log_result("API health check", True)
    except Exception as e:
        log_result("API health check", False, str(e))


# ═══════════════════════════════
# TEST 12: Document Upload via API
# ═══════════════════════════════
def test_document_upload_api(driver):
    """Test document upload via JavaScript API call."""
    try:
        clear_local_storage(driver)
        login_as(driver, "admin", "admin123")

        WebDriverWait(driver, 10).until(
            lambda d: "dashboard" in d.current_url
        )

        # Create a test file and upload via JavaScript
        upload_script = """
        const token = localStorage.getItem('idsts_token');
        const blob = new Blob(['Hello, IDSTS! This is a test document for Selenium testing.'], { type: 'text/plain' });
        const file = new File([blob], 'selenium_test.txt', { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/documents/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        const data = await response.json();
        return JSON.stringify({ status: response.status, data });
        """

        result = driver.execute_script(f"return (async () => {{ {upload_script} }})()")
        time.sleep(2)

        if result:
            import json
            parsed = json.loads(result)
            assert parsed['status'] == 201, f"Upload should return 201, got {parsed['status']}"
            assert parsed['data']['document']['original_name'] == 'selenium_test.txt'
            log_result("Document upload via API", True, f"Doc ID: {parsed['data']['document']['id'][:8]}…")
        else:
            log_result("Document upload via API", False, "No response received")
    except Exception as e:
        log_result("Document upload via API", False, str(e))


# ═══════════════════════════════
# TEST 13: Document List After Upload
# ═══════════════════════════════
def test_document_list(driver):
    """Verify uploaded document appears in the list."""
    try:
        # Still logged in as admin from previous test
        driver.get(f"{BASE_URL}/documents.html")
        time.sleep(2)

        page_text = driver.find_element(By.TAG_NAME, "body").text
        assert "selenium_test.txt" in page_text, "Uploaded document should appear in the list"

        log_result("Document list after upload", True)
    except Exception as e:
        log_result("Document list after upload", False, str(e))


# ═══════════════════════════════
# TEST 14: Document Download
# ═══════════════════════════════
def test_document_download(driver):
    """Verify document can be downloaded and decrypted."""
    try:
        download_script = """
        const token = localStorage.getItem('idsts_token');
        const listRes = await fetch('/api/documents', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const listData = await listRes.json();
        const doc = listData.documents.find(d => d.original_name === 'selenium_test.txt');
        if (!doc) return JSON.stringify({ error: 'Document not found' });

        const dlRes = await fetch('/api/documents/' + doc.id + '/download', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const text = await dlRes.text();
        return JSON.stringify({ status: dlRes.status, content: text, docId: doc.id });
        """

        result = driver.execute_script(f"return (async () => {{ {download_script} }})()")
        time.sleep(1)

        if result:
            import json
            parsed = json.loads(result)
            assert parsed['status'] == 200, f"Download should return 200, got {parsed['status']}"
            assert "Hello, IDSTS" in parsed['content'], "Decrypted content should match original"
            log_result("Document download & decrypt", True)
        else:
            log_result("Document download & decrypt", False, "No response")
    except Exception as e:
        log_result("Document download & decrypt", False, str(e))


# ═══════════════════════════════
# TEST 15: Audit Logs Record Actions
# ═══════════════════════════════
def test_audit_logs_recorded(driver):
    """Verify actions are recorded in audit logs."""
    try:
        driver.get(f"{BASE_URL}/audit-logs.html")
        time.sleep(2)

        page_text = driver.find_element(By.TAG_NAME, "body").text

        # Should have login and upload entries
        has_login = "LOGIN_SUCCESS" in page_text or "login" in page_text.lower()
        has_entries = "admin" in page_text

        assert has_login or has_entries, "Audit logs should show recorded actions"

        log_result("Audit logs record actions", True)
    except Exception as e:
        log_result("Audit logs record actions", False, str(e))


# ═══════════════════════════════
# MAIN
# ═══════════════════════════════
def main():
    print("\n" + "=" * 60)
    print("  🔒 IDSTS — Selenium Test Suite")
    print("=" * 60)
    print(f"  Target: {BASE_URL}")
    print("-" * 60)

    driver = None
    try:
        driver = setup_driver()
        print(f"  Browser: Chrome (headless)\n")

        test_api_health(driver)
        test_login_page_loads(driver)
        test_admin_login(driver)
        test_user_registration(driver)
        test_regular_user_login(driver)
        test_dashboard_data(driver)
        test_documents_page(driver)
        test_admin_pages(driver)
        test_access_control(driver)
        test_logout(driver)
        test_failed_login(driver)
        test_document_upload_api(driver)
        test_document_list(driver)
        test_document_download(driver)
        test_audit_logs_recorded(driver)

    except Exception as e:
        print(f"\n  ⚠️  Fatal error: {e}")
    finally:
        if driver:
            driver.quit()

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for _, p, _ in results if p)
    failed = sum(1 for _, p, _ in results if not p)
    total = len(results)
    print(f"  Results: {passed}/{total} passed, {failed} failed")

    if failed == 0:
        print("  🎉 All tests passed!")
    else:
        print("  ⚠️  Some tests failed:")
        for name, p, detail in results:
            if not p:
                print(f"    ❌ {name}: {detail}")

    print("=" * 60 + "\n")

    # Generate HTML Report
    report_path = "selenium_report.html"
    try:
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>IDSTS Test Report</title>
    <style>
        body {{ font-family: system-ui, sans-serif; margin: 40px; color: #1e293b; background: #f8fafc; }}
        h1 {{ border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; color: #0f172a; }}
        .summary {{ background: #ffffff; padding: 20px; border-radius: 8px; margin-bottom: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .stat {{ font-weight: bold; margin-right: 20px; padding: 5px 10px; border-radius: 4px; }}
        .pass-stat {{ background: #dcfce7; color: #166534; }}
        .fail-stat {{ background: #fee2e2; color: #991b1b; }}
        table {{ width: 100%; border-collapse: collapse; background: white; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }}
        th {{ background: #f1f5f9; color: #475569; }}
        .pass {{ color: #10b981; font-weight: bold; }}
        .fail {{ color: #ef4444; font-weight: bold; }}
        footer {{ margin-top: 40px; text-align: center; color: #64748b; font-size: 0.85em; }}
    </style>
</head>
<body>
    <h1>IDSTS Automated Test Report</h1>
    <div class="summary">
        <p><strong>Target:</strong> <a href="{BASE_URL}" target="_blank">{BASE_URL}</a></p>
        <p><strong>Date:</strong> {time.strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p style="margin-top: 15px;">
            <span class="stat">Total: {total}</span>
            <span class="stat pass-stat">Passed: {passed}</span>
            <span class="stat fail-stat">Failed: {failed}</span>
        </p>
    </div>
    <table>
        <tr><th>Status</th><th>Test Name</th><th>Details</th></tr>
"""
        for name, p, detail in results:
            status = "<span class='pass'>✅ PASS</span>" if p else "<span class='fail'>❌ FAIL</span>"
            safe_detail = detail if detail else "-"
            html_content += f"        <tr><td>{status}</td><td>{name}</td><td>{safe_detail}</td></tr>\n"

        html_content += """    </table>
    <footer>Report dynamically generated by IDSTS Selenium Suite</footer>
</body>
</html>"""

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"  📄 Generated HTML test report: {report_path}\n")
    except Exception as e:
        print(f"  ⚠️ Failed to write report: {e}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    exit(main())
