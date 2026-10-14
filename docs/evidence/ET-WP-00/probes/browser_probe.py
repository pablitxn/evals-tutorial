"""Attempt actual Phoenix UI with Chromium's browser sandbox enabled."""
import json
from playwright.sync_api import sync_playwright

receipt = {'browserSandbox':True,'tlsBypass':False,'mode':'local Phoenix UI'}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium',chromium_sandbox=True,headless=True)
        page = browser.new_page()
        errors = []
        page.on('pageerror',lambda error:errors.append(str(error)))
        response = page.goto('http://127.0.0.1:16006',wait_until='networkidle',timeout=30000)
        receipt.update({'status':'pass','httpStatus':response.status,'title':page.title(),
                        'bodyExcerpt':page.locator('body').inner_text()[:600], 'pageErrors':errors})
        assert response.status == 200
        browser.close()
except Exception as error:
    receipt.update({'status':'fail','errorType':type(error).__name__,'error':str(error)[:2800]})
print(json.dumps(receipt,indent=2))
