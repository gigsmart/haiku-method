---
title: "Example: Feature Implementation"
description: A complete walkthrough of implementing a real feature using AI-DLC
order: 11
---

This is a complete, realistic example of using AI-DLC to implement a feature. Follow along to see the methodology in action.

## The Feature

We're adding a **notification system** to a web application. Users should be able to:
- Receive in-app notifications
- Mark notifications as read
- Configure notification preferences

## Phase 1: Elaboration

### Starting the Process

```
User: /ai-dlc:elaborate

I want to add a notification system to our app. Users should
get notifications for important events and be able to manage them.
```

### AI Asks Clarifying Questions

**AI (Elaborator):** "I'll help define this intent. Let me ask some questions:

1. **Notification types:** What events trigger notifications?
   - User mentions, comments, likes, follows, system alerts?

2. **Delivery channels:** Just in-app, or also email/push?

3. **Real-time:** Should notifications appear instantly or on page refresh?

4. **Persistence:** How long do we keep notifications?

5. **Preferences:** What can users control?
   - Per-type enable/disable? Frequency? Quiet hours?"

### User Provides Context

```
User:
1. Start with: new comments on your posts, new followers, mentions
2. In-app only for now, email later
3. Real-time via WebSocket would be nice but polling is OK for v1
4. Keep 90 days, show last 50 in UI
5. Users can enable/disable each notification type
```

### AI Creates Intent

**AI:** "Based on our discussion, here's the intent:

```markdown
# .ai-dlc/add-notifications/intent.md

---
status: active
workflow: default
started_at: 2026-02-02T14:00:00Z
---

# Add Notification System

## Overview
Add an in-app notification system that alerts users to important
events (comments, followers, mentions) with user-configurable
preferences.

## Completion Criteria
- [ ] Users receive notifications for new comments on their posts
- [ ] Users receive notifications for new followers
- [ ] Users receive notifications when mentioned
- [ ] Notification bell shows unread count
- [ ] Clicking notification bell shows notification list (last 50)
- [ ] Users can mark individual notifications as read
- [ ] Users can mark all as read
- [ ] Users can enable/disable each notification type
- [ ] Notifications auto-delete after 90 days
- [ ] All tests pass
- [ ] No TypeScript errors
```

I'll break this into units..."

### AI Proposes Units

**AI:** "I recommend 4 units:

**unit-01-backend-model.md** - Database schema and API
- Notification model with type, read status, timestamps
- CRUD endpoints for notifications
- Preferences model and endpoints

**unit-02-notification-triggers.md** - Event hooks
- Create notifications on comment, follow, mention
- Wire up existing event system

**unit-03-frontend-ui.md** - React components
- Notification bell with badge
- Notification list dropdown
- Mark as read interactions

**unit-04-preferences.md** - Settings page
- Preference toggles for each type
- Save and apply preferences

Dependencies: unit-02 depends on unit-01, unit-03 depends on unit-01, unit-04 depends on unit-01.

Shall I create these files?"

```
User: Yes, looks good.
```

## Phase 2: Execution - Unit 01

### Starting the First Unit

```
User: /ai-dlc:execute
```

### Planner Hat (HITL)

**AI (Planner):** "Planning unit-01-backend-model.

**Current state analysis:**
- Database: PostgreSQL with Prisma ORM
- Existing models: User, Post, Comment, Follow
- API: Express with REST endpoints

**Plan:**

1. Create Notification model in Prisma schema
   - id, userId, type (enum), message, read, createdAt
   - Foreign key to User
   - Index on userId + createdAt for efficient queries

2. Create NotificationPreference model
   - userId, notificationType, enabled
   - Unique constraint on userId + type

3. Generate and run migration

4. Create API endpoints:
   - GET /api/notifications - list for current user
   - PATCH /api/notifications/:id/read - mark one as read
   - POST /api/notifications/mark-all-read - mark all as read
   - GET /api/notification-preferences - get preferences
   - PUT /api/notification-preferences - update preferences

5. Write tests for all endpoints

Proceed with this plan?"

```
User: Yes, proceed.
```

### Builder Hat (OHOTL)

**AI (Builder):** "Implementing unit-01-backend-model...

**Step 1: Adding Prisma models**

```prisma
// prisma/schema.prisma

enum NotificationType {
  COMMENT
  FOLLOW
  MENTION
}

model Notification {
  id        String           @id @default(uuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id])
  type      NotificationType
  message   String
  read      Boolean          @default(false)
  createdAt DateTime         @default(now())

  @@index([userId, createdAt(sort: Desc)])
}

model NotificationPreference {
  id       String           @id @default(uuid())
  userId   String
  user     User             @relation(fields: [userId], references: [id])
  type     NotificationType
  enabled  Boolean          @default(true)

  @@unique([userId, type])
}
```

Running migration...
- Migration `20260202_add_notifications` created
- Migration applied successfully

**Step 2: Creating API routes**

```typescript
// src/routes/notifications.ts

router.get('/api/notifications', auth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
});

// ... additional endpoints implemented
```

**Step 3: Running tests**

```
npm test -- --grep notifications

  Notification API
    ✓ GET /api/notifications returns user notifications
    ✓ GET /api/notifications returns empty array for new user
    ✓ PATCH /api/notifications/:id/read marks as read
    ✓ PATCH /api/notifications/:id/read returns 404 for other user
    ✓ POST /api/notifications/mark-all-read marks all as read
    ✓ GET /api/notification-preferences returns defaults
    ✓ PUT /api/notification-preferences updates preferences

  7 passing (2s)
```

**Step 4: Running quality gates**

```
tsc --noEmit    # No errors
npm run lint    # No warnings
npm run test    # 7/7 passing
```

All quality gates pass. Unit complete."

### Reviewer Hat (HITL)

**AI (Reviewer):** "Reviewing unit-01-backend-model:

**Completion Criteria Check:**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Notification model created | PASS | Prisma schema + migration |
| Preferences model created | PASS | Schema + unique constraint |
| List endpoint works | PASS | Test: returns user notifications |
| Mark as read works | PASS | Test: marks individual |
| Mark all read works | PASS | Test: marks all |
| Preferences CRUD works | PASS | Tests: get + update |
| Tests pass | PASS | 7/7 passing |
| No TS errors | PASS | tsc clean |

**Code Quality:**
- Good: Proper indexes for query performance
- Good: Auth middleware on all routes
- Good: Proper 404 handling for access control
- Note: Consider pagination for list endpoint (future)

**Security:**
- Auth required on all endpoints
- User can only access own notifications
- No sensitive data exposed

**Recommendation:** APPROVE

Ready for unit-02."

## Phase 3: Execution - Unit 02

### Planner Hat

**AI (Planner):** "Planning unit-02-notification-triggers.

**Analysis:**
- Existing event system uses EventEmitter pattern
- Events: `comment:created`, `follow:created`, `mention:detected`
- Need to listen and create notifications

**Plan:**
1. Create NotificationService class
2. Subscribe to relevant events
3. Check user preferences before creating
4. Create notification record
5. Write integration tests

Proceed?"

```
User: Yes
```

### Builder Hat

**AI (Builder):** "Implementing triggers...

```typescript
// src/services/notification-service.ts

export class NotificationService {
  constructor(private eventBus: EventEmitter) {
    this.subscribe();
  }

  private subscribe() {
    this.eventBus.on('comment:created', this.onComment.bind(this));
    this.eventBus.on('follow:created', this.onFollow.bind(this));
    this.eventBus.on('mention:detected', this.onMention.bind(this));
  }

  private async onComment(event: CommentCreatedEvent) {
    const postAuthor = await getPostAuthor(event.postId);
    if (postAuthor.id === event.authorId) return; // Don't notify self

    if (await this.isEnabled(postAuthor.id, 'COMMENT')) {
      await this.create({
        userId: postAuthor.id,
        type: 'COMMENT',
        message: `${event.authorName} commented on your post`,
      });
    }
  }

  // ... similar for follow and mention
}
```

Tests:
```
  Notification Triggers
    ✓ creates notification when someone comments on post
    ✓ does not notify when commenting on own post
    ✓ respects user preference to disable comments
    ✓ creates notification for new follower
    ✓ creates notification when mentioned

  5 passing
```

All gates pass."

### Reviewer Hat

**AI (Reviewer):** "Reviewing unit-02:

- [x] Comment notifications work
- [x] Follow notifications work
- [x] Mention notifications work
- [x] Preferences respected
- [x] Self-notification prevented

APPROVE."

## Phase 4: Execution - Units 03-04

*(Similar pattern continues for frontend and preferences units)*

### Unit 03 Summary (Frontend)

Built:
- `NotificationBell` component with unread badge
- `NotificationList` dropdown with mark-as-read
- Real-time updates via periodic polling (5s)

### Unit 04 Summary (Preferences)

Built:
- Settings page section for notifications
- Toggle switches for each notification type
- Optimistic UI updates with rollback

## Phase 5: Intent Completion

**AI:** "All units complete for 'Add Notification System':

| Unit | Status | Tests |
|------|--------|-------|
| unit-01-backend-model | completed | 7 pass |
| unit-02-notification-triggers | completed | 5 pass |
| unit-03-frontend-ui | completed | 8 pass |
| unit-04-preferences | completed | 4 pass |

**Intent Completion Criteria:**

- [x] Users receive notifications for comments - Verified
- [x] Users receive notifications for followers - Verified
- [x] Users receive notifications for mentions - Verified
- [x] Notification bell shows unread count - Verified
- [x] Notification list shows last 50 - Verified
- [x] Mark individual as read - Verified
- [x] Mark all as read - Verified
- [x] Enable/disable by type - Verified
- [x] 90-day auto-delete - Verified (cron job added)
- [x] All tests pass - 24/24 passing
- [x] No TypeScript errors - Clean

**Intent COMPLETE.**

Would you like me to:
1. Create a PR with all changes
2. Generate release notes
3. Start a new intent"

## Key Takeaways

### What Worked Well

1. **Clarifying questions surfaced requirements** - Real-time vs polling decision made early
2. **Unit dependencies were clear** - Backend first enabled parallel frontend work
3. **Backpressure caught issues** - Test failures guided implementation
4. **Hats kept focus** - Planning before building prevented scope creep

### Time Spent

- Elaboration: ~15 minutes (including clarification)
- Unit 01 (backend): ~45 minutes
- Unit 02 (triggers): ~30 minutes
- Unit 03 (frontend): ~60 minutes
- Unit 04 (preferences): ~20 minutes

Total: ~2.5 hours for a complete notification system with 24 tests.

### What the Human Did

1. Answered clarifying questions
2. Approved plans
3. Reviewed AI decisions
4. Made trade-off calls (polling vs WebSocket)

### What AI Did

1. Structured the requirements
2. Broke down into units
3. Planned each implementation
4. Wrote all code and tests
5. Verified completion criteria

## After Construction: Operations

With the notification system complete, the Builder defined operations for ongoing maintenance:

- **`clear-expired-notifications`** — A scheduled agent operation running nightly to purge notifications older than 90 days
- **`monitor-delivery-latency`** — A reactive agent operation that alerts when notification delivery exceeds 5 seconds
- **`review-notification-metrics`** — A monthly human process to review delivery rates, open rates, and preference trends

These operation specs live in `.ai-dlc/notifications/operations/` and are managed with `/ai-dlc:operate notifications`. See the [Operations Guide](/docs/operations-guide/) for details.

## Next Steps

- **[Example: Bug Fix](/docs/example-bugfix/)** - See the hypothesis workflow
- **[Workflows](/docs/workflows/)** - Try different patterns
- **[Core Concepts](/docs/concepts/)** - Deepen understanding
