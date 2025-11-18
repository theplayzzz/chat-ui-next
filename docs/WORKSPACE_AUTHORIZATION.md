# Workspace Authorization System - Health Plan Assistant

## Overview

This document describes the workspace-based authorization system implemented for the Health Plan Assistant feature. The system ensures that only authorized workspaces can access the health plan recommendation capabilities.

## Architecture

### Three-Layer Security Model

1. **Frontend Layer**: Visual filtering and user feedback
2. **Backend API Layer**: Request validation and authorization
3. **Database RLS Layer**: Row-level security policies

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  - useHealthPlanAccess hook                                 │
│  - WorkspaceRestrictionNotice component                     │
│  - AssistantPicker with visual badges                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Backend API (Next.js)                       │
│  - workspace-authorization.ts helpers                       │
│  - workspace-auth.ts middleware                             │
│  - API route validation                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Database (Supabase + RLS)                       │
│  - assistant_workspaces table                               │
│  - RLS policies on assistants                               │
│  - workspace_users membership                               │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Frontend

#### 1. `hooks/use-health-plan-access.ts`

Hook that provides workspace authorization state.

```typescript
const { isAuthorized, isHealthPlanAssistant, healthPlanAssistants } =
  useHealthPlanAccess()
```

**Exports:**
- `isAuthorized`: Boolean indicating if workspace has access
- `isHealthPlanAssistant(assistant)`: Function to check if assistant is health plan type
- `healthPlanAssistants`: Array of health plan assistants in workspace

#### 2. `components/health-plan/workspace-restriction-notice.tsx`

Component to display when workspace lacks access.

```typescript
<WorkspaceRestrictionNotice variant="inline" />
<WorkspaceRestrictionNotice variant="banner" showContactLink />
```

**Variants:**
- `inline`: Compact inline message
- `banner`: Full-width prominent banner

#### 3. `components/chat/assistant-picker.tsx` (Updated)

Now shows visual badge for health plan assistants.

- Badge with IconHeartbeat icon
- "Health Plan" label
- Primary color scheme

### Backend

#### 1. `lib/server/workspace-authorization.ts`

Core authorization helpers.

**Functions:**
- `validateUserAuthentication()`: Verify user is authenticated
- `validateWorkspaceMembership(userId, workspaceId)`: Check workspace access
- `validateAssistantWorkspaceAssociation(assistantId, workspaceId)`: Verify assistant link
- `validateAssistantWorkspaceAccess(assistantId, workspaceId)`: Complete validation
- `getAuthorizedWorkspacesForAssistant(assistantId)`: List authorized workspaces
- `isHealthPlanAssistant(assistantId)`: Check if assistant is health plan type
- `unauthorizedResponse(message, statusCode)`: Standard 403 response

#### 2. `lib/middleware/workspace-auth.ts`

Middleware for API routes.

```typescript
const authResult = await validateWorkspaceAuthMiddleware(request)
if (!authResult.isAuthorized) {
  return authResult.response
}
```

**Functions:**
- `validateWorkspaceAuthMiddleware(request)`: Main validation middleware
- `extractAuthParams(request)`: Extract auth params from request
- `validateUserAuth(request)`: Simple authentication check
- `logAuthAttempt(result, context)`: Structured logging

#### 3. `app/api/tools/search-health-plans/route.ts` (Updated)

Now requires workspace authorization.

**Required parameters:**
- `assistantId`: Assistant being accessed
- `workspaceId`: Workspace context
- `clientInfo`: Client information

**Authorization flow:**
1. Parse request body
2. Validate required parameters
3. Call `validateAssistantWorkspaceAccess()`
4. Log authorization attempt
5. Return 403 if unauthorized
6. Proceed with search if authorized

### Admin Interface

#### 1. `lib/server/admin-helpers.ts`

Admin permission management functions.

**Functions:**
- `isUserAdmin(userId, workspaceId)`: Check if user is workspace owner
- `grantHealthPlanAccess(workspaceId, assistantId, userId)`: Grant access
- `revokeHealthPlanAccess(workspaceId, assistantId, userId)`: Revoke access
- `listAuthorizedWorkspaces(assistantId)`: List all workspaces with status
- `getHealthPlanAssistantId()`: Find health plan assistant
- `logAuditEvent(event)`: Audit logging

#### 2. `app/api/admin/workspace-permissions/route.ts`

API for managing permissions.

**Endpoints:**
- `GET /api/admin/workspace-permissions?workspaceId=xxx`: List workspaces
- `POST /api/admin/workspace-permissions`: Grant access
- `DELETE /api/admin/workspace-permissions`: Revoke access

**All endpoints require:**
- User authentication
- Admin privileges (workspace owner)
- Valid workspace IDs

#### 3. `components/admin/workspace-permissions.tsx`

React component for admin UI.

**Features:**
- Table of all workspaces
- Visual status indicators (Authorized/No Access)
- Grant/Revoke buttons
- Loading states
- Error handling
- Auto-refresh after changes

## Database Schema

### Tables Used

#### `assistant_workspaces`
Links assistants to workspaces.

```sql
CREATE TABLE assistant_workspaces (
  user_id UUID NOT NULL,
  assistant_id UUID NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (assistant_id, workspace_id)
);
```

#### `collections`
Stores document collections with type.

```sql
ALTER TABLE collections ADD COLUMN collection_type TEXT;
-- Type 'health_plan' identifies health plan collections
```

#### `assistant_collections`
Links assistants to collections.

```sql
-- Existing table - no changes needed
-- Used to identify health plan assistants by their collections
```

### RLS Policies

#### Existing Policies

**assistants table:**
```sql
-- Users can access their own assistants
CREATE POLICY "Allow full access to own assistants"
ON assistants
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can view non-private assistants
CREATE POLICY "Allow view access to non-private assistants"
ON assistants
FOR SELECT
USING (sharing <> 'private');
```

**assistant_workspaces table:**
```sql
-- Users control their own workspace associations
CREATE POLICY "Allow full access to own assistant_workspaces"
ON assistant_workspaces
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

#### Validation Notes

The existing RLS policies, combined with application-level filtering, provide adequate security:

1. **assistants** table: Only creator or public assistants visible
2. **assistant_workspaces** table: Only creator can modify associations
3. **Application layer**: Validates workspace membership before API access
4. **Frontend layer**: Only shows assistants linked to current workspace

## Authorization Flow

### User Accessing Health Plan Assistant

```
1. User opens workspace
   ↓
2. Frontend loads assistants via getAssistantWorkspacesByWorkspaceId()
   ↓
3. Only assistants in assistant_workspaces for this workspace are returned
   ↓
4. useHealthPlanAccess hook identifies health plan assistants
   ↓
5. AssistantPicker shows health plan assistants with badge
   ↓
6. User selects health plan assistant
   ↓
7. Frontend sends request to /api/tools/search-health-plans
   ↓
8. API validates:
   - User is authenticated
   - User has workspace access
   - Assistant belongs to workspace
   ↓
9. If authorized: Process request
   If unauthorized: Return 403
```

### Admin Granting Access

```
1. Admin opens WorkspacePermissions component
   ↓
2. Component loads all workspaces via GET /api/admin/workspace-permissions
   ↓
3. API validates admin is workspace owner
   ↓
4. Returns list of workspaces with access status
   ↓
5. Admin clicks "Grant" button
   ↓
6. POST /api/admin/workspace-permissions
   ↓
7. API validates admin privileges
   ↓
8. Creates assistant_workspaces entry
   ↓
9. Logs audit event
   ↓
10. Returns success
    ↓
11. Component refreshes list
```

## Security Considerations

### Authentication
- All API routes validate user authentication via `validateUserAuthentication()`
- Uses Supabase session cookies
- Automatic session expiration

### Authorization Layers

1. **User-level**: Must be authenticated
2. **Workspace-level**: Must be workspace member
3. **Assistant-level**: Assistant must be linked to workspace
4. **Admin-level**: Must be workspace owner for permission management

### Attack Prevention

**Scenario: User tries to access unauthorized workspace**
- Result: `validateWorkspaceMembership()` returns false → 403

**Scenario: User tries to access assistant not in their workspace**
- Result: `validateAssistantWorkspaceAssociation()` returns false → 403

**Scenario: User tries to grant access without admin privileges**
- Result: `isUserAdmin()` returns false → 403

**Scenario: Direct database manipulation**
- Result: RLS policies prevent unauthorized row access

## Usage Examples

### Checking Access in Frontend

```typescript
import { useHealthPlanAccess } from "@/hooks/use-health-plan-access"

function MyComponent() {
  const { isAuthorized, isHealthPlanAssistant } = useHealthPlanAccess()

  if (!isAuthorized) {
    return <WorkspaceRestrictionNotice variant="banner" />
  }

  return <HealthPlanChat />
}
```

### Validating in API Route

```typescript
import {
  validateAssistantWorkspaceAccess,
  unauthorizedResponse
} from "@/lib/server/workspace-authorization"

export async function POST(request: NextRequest) {
  const { assistantId, workspaceId } = await request.json()

  const authResult = await validateAssistantWorkspaceAccess(
    assistantId,
    workspaceId
  )

  if (!authResult.isAuthorized) {
    return unauthorizedResponse(authResult.errors.join("; "))
  }

  // Proceed with authorized request...
}
```

### Managing Permissions

```typescript
import { WorkspacePermissions } from "@/components/admin/workspace-permissions"

function AdminPanel() {
  return (
    <div>
      <h1>Workspace Permissions</h1>
      <WorkspacePermissions />
    </div>
  )
}
```

## Testing

### Test Scenarios

**Frontend:**
- [ ] Health plan assistant visible only in authorized workspaces
- [ ] Badge displays correctly on health plan assistants
- [ ] Restriction notice shows when workspace not authorized

**Backend:**
- [ ] API returns 403 for unauthorized workspace
- [ ] API returns 403 for non-member users
- [ ] API returns 403 for assistant not in workspace
- [ ] API proceeds when fully authorized

**Admin:**
- [ ] Admin can list all workspaces
- [ ] Admin can grant access to workspace
- [ ] Admin can revoke access from workspace
- [ ] Non-admin cannot access admin endpoints

**RLS:**
- [ ] Direct database queries respect RLS policies
- [ ] Users cannot see assistants from other workspaces
- [ ] Users cannot modify assistant_workspaces of others

### Test File

See `__tests__/workspace-authorization.test.ts` for unit tests.

## Troubleshooting

### Issue: Assistant not showing in workspace

**Check:**
1. Is there an entry in `assistant_workspaces` for this workspace?
2. Is the assistant marked as private by another user?
3. Does the assistant have health_plan collections?

**Solution:**
Use admin interface to grant access to workspace.

### Issue: 403 error when accessing API

**Check:**
1. Is user authenticated? (Check browser cookies)
2. Is user a member of the workspace? (Check `workspace_users`)
3. Is assistant linked to workspace? (Check `assistant_workspaces`)

**Debug:**
Check server logs for authorization failure details.

### Issue: Admin interface not loading

**Check:**
1. Is user the workspace owner? (Check `workspaces.user_id`)
2. Is health plan assistant set up? (Check collections with type='health_plan')
3. Check browser console for API errors

## Future Enhancements

### Planned Improvements

1. **Role-Based Access Control (RBAC)**
   - Add roles table (admin, member, viewer)
   - Fine-grained permissions per role
   - Multiple admins per workspace

2. **Audit Table**
   - Dedicated `audit_logs` table
   - Track all permission changes
   - Queryable audit history
   - Compliance reporting

3. **Bulk Operations**
   - Grant access to multiple workspaces at once
   - Revoke access from multiple workspaces
   - Import/export workspace permissions

4. **Enhanced RLS**
   - Additional view-based policies
   - Workspace membership verification in RLS
   - Automated policy testing

5. **Performance Optimization**
   - Cache workspace authorizations
   - Batch authorization checks
   - Optimize database queries

## Maintenance

### Regular Tasks

- **Weekly**: Review authorization logs for anomalies
- **Monthly**: Audit workspace permissions
- **Quarterly**: Review and update RLS policies
- **On new assistant**: Configure workspace permissions

### Monitoring

Key metrics to track:
- Authorization failure rate
- API latency for auth checks
- Number of authorized workspaces
- Admin permission changes

## Support

For issues or questions:
1. Check this documentation
2. Review test file for examples
3. Check server logs for errors
4. Contact system administrator

---

**Last Updated**: 2025-11-18
**Version**: 1.0
**Status**: Production Ready
