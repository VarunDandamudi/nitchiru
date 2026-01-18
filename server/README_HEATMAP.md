
### Activity Heatmap Documentation

The user's activity heatmap is generated based on their message history.

- **Source**: `ChatHistory` collection in MongoDB.
- **Aggregation**: Be default, each message text part sent by the user counts as an activity. The backend unwinds the `messages` array in the `ChatHistory` document and filters for messages sent by the user (implicitly by `userId` association of the chat session, though strict validation of `role: 'user'` could be added if needed, currently assumes all messages in a user's `ChatHistory` are relevant or we count interactions).
- **Timezone**: All dates are handled in **UTC** on the backend. The API returns activity counts grouped by YYYY-MM-DD.
- **Missing Data**: The backend fills in days with 0 activity so the frontend receives a complete list of days for the requested year.
