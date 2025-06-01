# Monorepo Setup Guide

## 🚀 Proper Monorepo Structure for VibeCheck

### ❌ What Went Wrong Initially

When you have separate git repositories in subdirectories (`check/` and `vibe/` had their own `.git` folders), Git treats them as submodules when you try to add them. This creates empty references instead of tracking the actual files.

### ✅ Correct Monorepo Setup

#### 1. **Single Git Repository**
```bash
project-root/
├── .git/                    # Only ONE .git folder at the root
├── .github/                 # GitHub Actions workflows
│   └── workflows/
├── check/                   # Backend (NO .git folder here)
│   ├── src/
│   ├── package.json
│   └── ...
├── vibe/                    # Frontend (NO .git folder here)
│   ├── app/
│   ├── package.json
│   └── ...
├── scripts/                 # Shared scripts
├── .gitignore              # Root gitignore
└── README.md
```

#### 2. **Initial Setup Steps**

```bash
# 1. Create project directory
mkdir vibecheck-monorepo
cd vibecheck-monorepo

# 2. Initialize git at the ROOT only
git init

# 3. Create your subdirectories
mkdir check vibe scripts

# 4. Add your code to subdirectories
# Copy or create files in check/ and vibe/

# 5. Create root .gitignore
cat > .gitignore << EOF
# Dependencies
node_modules/
.pnpm-store/

# Environment
.env
.env.*
!.env.example

# Build outputs
dist/
build/

# Logs
*.log
logs/

# Database
*.db
*.db-*

# OS files
.DS_Store
EOF

# 6. Add everything to git
git add .
git commit -m "Initial monorepo setup"
```

#### 3. **If You Already Have Separate Repos**

If you already have separate repositories for `check` and `vibe`:

```bash
# 1. Clone your main repo
git clone <your-repo-url> vibecheck
cd vibecheck

# 2. Remove any submodule references
git rm --cached check vibe

# 3. Remove .git folders from subdirectories
rm -rf check/.git vibe/.git

# 4. Add the actual files
git add check/ vibe/

# 5. Commit the changes
git commit -m "fix: convert submodules to regular directories"

# 6. Push to remote
git push origin main
```

### 📋 Best Practices for Monorepos

#### 1. **Package Management**
- Use different package managers if needed (e.g., `bun` for backend, `pnpm` for frontend)
- Each subdirectory has its own `package.json`
- Install dependencies separately:
  ```bash
  cd check && bun install
  cd ../vibe && pnpm install
  ```

#### 2. **Scripts Organization**
Create root-level scripts for common tasks:

```json
// package.json at root (optional)
{
  "name": "vibecheck-monorepo",
  "private": true,
  "scripts": {
    "dev:backend": "cd check && bun dev",
    "dev:frontend": "cd vibe && pnpm start",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "lint": "cd check && bun lint && cd ../vibe && pnpm lint"
  }
}
```

#### 3. **CI/CD Configuration**
Configure GitHub Actions to work with subdirectories:

```yaml
# .github/workflows/ci.yml
jobs:
  backend-ci:
    defaults:
      run:
        working-directory: ./check
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun test

  frontend-ci:
    defaults:
      run:
        working-directory: ./vibe
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test
```

### 🔍 Troubleshooting

#### Problem: "fatal: no submodule mapping found"
**Solution**: Remove cached submodules and re-add as regular directories:
```bash
git rm --cached check vibe
git add check/ vibe/
git commit -m "fix: convert to regular directories"
```

#### Problem: CI can't find package.json
**Solution**: Ensure directories are tracked as regular folders, not submodules:
```bash
# Check if files are properly tracked
git ls-files check/package.json
# Should show: check/package.json
```

#### Problem: Changes in subdirectories not showing in git status
**Solution**: Check for nested .git folders:
```bash
find . -name .git -type d
# Should only show: ./.git
```

### 🎯 Benefits of This Structure

1. **Single Source of Truth**: One repository for the entire project
2. **Atomic Commits**: Changes across frontend/backend in one commit
3. **Simplified CI/CD**: Deploy everything from one pipeline
4. **Easier Code Sharing**: Share types, utilities between projects
5. **Consistent Versioning**: Tag releases for the entire project

### 📚 Additional Resources

- [Lerna](https://lerna.js.org/) - JavaScript monorepo tool
- [Nx](https://nx.dev/) - Advanced monorepo management
- [Turborepo](https://turbo.build/) - High-performance build system
- [pnpm Workspaces](https://pnpm.io/workspaces) - Native monorepo support

Remember: The key is having **only one .git folder at the root** of your project! 