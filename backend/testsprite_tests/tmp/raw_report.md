
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** pon-e-line-backend
- **Date:** 2025-12-12
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001
- **Test Name:** test user login with valid credentials
- **Test Code:** [TC001_test_user_login_with_valid_credentials.py](./TC001_test_user_login_with_valid_credentials.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 26, in <module>
  File "<string>", line 18, in test_user_login_with_valid_credentials
AssertionError: Expected status 200, got 401

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/c8d55a7c-ddad-4568-a92a-b093566e2f88
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002
- **Test Name:** test user registration with valid data
- **Test Code:** [TC002_test_user_registration_with_valid_data.py](./TC002_test_user_registration_with_valid_data.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 22, in <module>
  File "<string>", line 20, in test_user_registration_with_valid_data
AssertionError: Expected status code 201, got 400

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/85b78338-bd97-465e-b38f-2026d35867c5
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003
- **Test Name:** test create new agent
- **Test Code:** [TC003_test_create_new_agent.py](./TC003_test_create_new_agent.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 50, in <module>
  File "<string>", line 34, in test_create_new_agent
AssertionError: Expected status 201, got 401

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/b3634945-93b1-406f-ba7c-f3fdb5cfb7d9
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004
- **Test Name:** test update existing agent
- **Test Code:** [TC004_test_update_existing_agent.py](./TC004_test_update_existing_agent.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 78, in <module>
  File "<string>", line 45, in test_update_existing_agent
AssertionError: Agent creation failed: {"error":"Missing or invalid authorization header"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/c9fb3bb3-735e-4251-9cac-0fa52669d821
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005
- **Test Name:** test delete agent by id
- **Test Code:** [TC005_test_delete_agent_by_id.py](./TC005_test_delete_agent_by_id.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 47, in <module>
  File "<string>", line 27, in test_delete_agent_by_id
AssertionError: Agent creation failed: {"error":"Invalid token"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/b4279bd0-ecdb-4f62-9d68-6facf283538b
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006
- **Test Name:** test list contacts with pagination and search
- **Test Code:** [TC006_test_list_contacts_with_pagination_and_search.py](./TC006_test_list_contacts_with_pagination_and_search.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 49, in <module>
  File "<string>", line 24, in test_list_contacts_with_pagination_and_search
AssertionError: Expected status code 200, got 401

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/d461e28e-e954-4947-bac6-8a98db7afbb3
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007
- **Test Name:** test bulk import contacts from csv
- **Test Code:** [TC007_test_bulk_import_contacts_from_csv.py](./TC007_test_bulk_import_contacts_from_csv.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 31, in <module>
  File "<string>", line 27, in test_bulk_import_contacts_from_csv
AssertionError: Expected status code 201, got 401

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/5a4b1f40-87e0-4440-8670-4f59a52a30e8
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008
- **Test Name:** test initiate outbound call
- **Test Code:** [TC008_test_initiate_outbound_call.py](./TC008_test_initiate_outbound_call.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 54, in <module>
  File "<string>", line 23, in test_initiate_outbound_call
AssertionError: Agent creation failed: {"error":"Invalid token"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/630bd91d-2a6f-453b-82ba-835df357de88
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009
- **Test Name:** test create new campaign
- **Test Code:** [TC009_test_create_new_campaign.py](./TC009_test_create_new_campaign.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 50, in <module>
  File "<string>", line 28, in test_create_new_campaign
AssertionError: Expected 201, got 401

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/e0bc22fa-e87f-4d71-88f0-acae05261f9f
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010
- **Test Name:** test start campaign by id
- **Test Code:** [TC010_test_start_campaign_by_id.py](./TC010_test_start_campaign_by_id.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 50, in <module>
  File "<string>", line 28, in test_start_campaign_by_id
AssertionError: Failed to create campaign: {"error":"Invalid token"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/12eab59d-25a3-492a-af7b-6c2d1c92b3ec/97c4282f-5e56-4603-b2e6-2911325db53e
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **0.00** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---