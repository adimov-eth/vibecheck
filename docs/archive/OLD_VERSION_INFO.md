# Old Version Information

## 🗂️ Repository Structure Update

This repository was updated on January 2025 with a completely new codebase for VibeCheck.

### 📌 Preserved Branches

The old version of the code has been preserved in the following branches:

- **`legacy-v1`** - The original main branch before the update
- **`login`** - Old login feature branch
- **`v2`** - Old v2 branch
- **`v42`** - Old v42 branch

### 🔍 Accessing Old Code

To access the old version:

```bash
# Clone and checkout the legacy branch
git clone https://github.com/adimov-eth/vibecheck.git
cd vibecheck
git checkout legacy-v1
```

### 📊 Key Differences

| Old Version | New Version |
|-------------|-------------|
| Folders: `app/`, `server/` | Folders: `vibe/`, `check/` |
| Single repository structure | Monorepo with separate frontend/backend |
| Basic Express server | Bun runtime with advanced features |
| React Native app | React Native + Expo with TypeScript |

### 🚀 New Features

The new version includes:
- GitHub Actions CI/CD pipeline
- Comprehensive documentation
- Modern architecture with Bun runtime
- Enhanced TypeScript configuration
- Automated deployment workflow
- Advanced audio processing with queues
- WebSocket real-time updates

### 📝 Migration Notes

If you need to reference old code:
1. Check out the `legacy-v1` branch
2. Compare with the new structure
3. Old API endpoints may have changed

For questions about the old version, please check the commit history on the `legacy-v1` branch. 