# Database Options for Dokploy Deployment

You have three options for database deployment on Dokploy:

## Option 1: SQLite (Current Approach) ✅ Simple
**Best for**: Simple deployments, single VPS, low traffic

### Pros:
- Zero configuration
- No additional services needed
- Fast for small datasets
- Already implemented

### Cons:
- Limited concurrent writes
- Harder to backup while running
- No built-in replication

### Deployment:
Use the existing `docker-compose.dokploy.yml`

---

## Option 2: PostgreSQL in Docker Compose 🔧 Balanced
**Best for**: Medium traffic, better reliability, staying within single deployment

### Pros:
- Better concurrency
- ACID compliance
- Easy backups with pg_dump
- Can scale reads with replicas
- Still single deployment

### Cons:
- More memory usage (~100MB)
- Requires password management

### Deployment:
Use `docker-compose.dokploy-postgres.yml`

### Required Code Changes:
1. Update `TokenStoreService` to use PostgreSQL
2. Add database migrations
3. Update connection handling

---

## Option 3: Dokploy PostgreSQL Service 🚀 Production
**Best for**: High availability, managed backups, multi-app usage

### Pros:
- Managed by Dokploy
- Automatic backups
- Better resource isolation
- Can be shared between apps
- Professional monitoring

### Cons:
- Requires separate service setup
- Additional configuration in Dokploy

### Setup in Dokploy:

1. **Create PostgreSQL Service**:
   - In Dokploy → Services → Add Service
   - Choose PostgreSQL
   - Set database name: `twitch_bot`
   - Set strong password
   - Enable automatic backups

2. **Get Connection Details**:
   - Internal hostname: `postgres.your-project.internal`
   - Port: 5432
   - Database: twitch_bot

3. **Update Environment Variables**:
   ```env
   DATABASE_URL=postgresql://twitch_bot:password@postgres.your-project.internal:5432/twitch_bot
   ```

4. **Update docker-compose.yml**:
   ```yaml
   services:
     auth-server:
       # ... other config ...
       environment:
         - DATABASE_URL=${DATABASE_URL}
       # Remove postgres service and dependencies
   ```

---

## Migration Path

If you want to start with SQLite and migrate later:

1. **Export from SQLite**:
   ```bash
   # In container
   sqlite3 /data/tokens.db .dump > tokens_backup.sql
   ```

2. **Convert to PostgreSQL**:
   - Use a tool like `pgloader`
   - Or write a migration script

3. **Import to PostgreSQL**:
   ```bash
   psql $DATABASE_URL < tokens_backup_converted.sql
   ```

---

## Recommendation

For your use case (Twitch bots with token management):

- **Start with**: Option 1 (SQLite) - It's already working
- **Upgrade to**: Option 3 (Dokploy PostgreSQL) when you need:
  - Multiple bot instances
  - Better monitoring
  - Automatic backups
  - Higher reliability

The token database is relatively simple and low-traffic, so SQLite should work fine initially. The main operations are:
- Reading tokens on startup
- Occasional token updates/refreshes
- Rare new token generation

PostgreSQL becomes valuable when you add features like:
- Analytics/metrics storage
- Chat message history
- User preferences
- Multiple streamers