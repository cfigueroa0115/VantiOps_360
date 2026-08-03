# ============================================================
# VantiOps 360 — Developer Environment Setup Script
# ============================================================
# Configures the development environment in < 30 minutes.
# Run from project root: .\scripts\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Write-Step {
    param([string]$Message)
    Write-Host "`n>> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "   [OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "   [WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "   [FAIL] $Message" -ForegroundColor Red
}

# ============================================================
# Timer
# ============================================================
$StartTime = Get-Date

Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  VantiOps 360 — Developer Environment Setup" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Project root: $ProjectRoot"
Write-Host ""

# ============================================================
# Step 1: Check Prerequisites
# ============================================================
Write-Step "Checking prerequisites..."

# Node.js
$nodeVersion = $null
try {
    $nodeVersion = (node --version 2>$null)
    if ($nodeVersion -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -ge 20) {
            Write-Success "Node.js $nodeVersion (>= 20 required)"
        } else {
            Write-Fail "Node.js $nodeVersion found, but >= 20 required"
            Write-Host "   Install from: https://nodejs.org/" -ForegroundColor Yellow
            exit 1
        }
    }
} catch {
    Write-Fail "Node.js not found. Install from: https://nodejs.org/"
    exit 1
}

# npm
try {
    $npmVersion = (npm --version 2>$null)
    Write-Success "npm $npmVersion"
} catch {
    Write-Fail "npm not found"
    exit 1
}

# Python
$pythonCmd = $null
try {
    $pyVersion = (python --version 2>$null)
    if ($pyVersion -match "(\d+)\.(\d+)") {
        $pyMajor = [int]$Matches[1]
        $pyMinor = [int]$Matches[2]
        if ($pyMajor -ge 3 -and $pyMinor -ge 11) {
            Write-Success "Python $pyVersion (>= 3.11 required)"
            $pythonCmd = "python"
        } else {
            Write-Fail "Python $pyVersion found, but >= 3.11 required"
            Write-Host "   Install from: https://www.python.org/downloads/" -ForegroundColor Yellow
            exit 1
        }
    }
} catch {
    # Try python3
    try {
        $pyVersion = (python3 --version 2>$null)
        if ($pyVersion -match "(\d+)\.(\d+)") {
            $pyMajor = [int]$Matches[1]
            $pyMinor = [int]$Matches[2]
            if ($pyMajor -ge 3 -and $pyMinor -ge 11) {
                Write-Success "Python $pyVersion (>= 3.11 required)"
                $pythonCmd = "python3"
            }
        }
    } catch {
        Write-Fail "Python 3.11+ not found. Install from: https://www.python.org/downloads/"
        exit 1
    }
}

# Git
try {
    $gitVersion = (git --version 2>$null)
    Write-Success "Git: $gitVersion"
} catch {
    Write-Fail "Git not found. Install from: https://git-scm.com/"
    exit 1
}

# ============================================================
# Step 2: Install Frontend Dependencies
# ============================================================
Write-Step "Installing frontend dependencies..."

Push-Location "$ProjectRoot\frontend"
try {
    npm ci 2>&1 | Out-Null
    Write-Success "Frontend dependencies installed (npm ci)"
} catch {
    Write-Fail "Failed to install frontend dependencies"
    Write-Host $_.Exception.Message -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# ============================================================
# Step 3: Install Backend Dependencies
# ============================================================
Write-Step "Installing backend dependencies..."

Push-Location "$ProjectRoot\backend"
try {
    # Create venv if it doesn't exist
    if (-not (Test-Path ".venv")) {
        & $pythonCmd -m venv .venv 2>&1 | Out-Null
        Write-Success "Python virtual environment created (.venv)"
    } else {
        Write-Success "Python virtual environment already exists"
    }

    # Activate and install
    $activateScript = ".venv\Scripts\Activate.ps1"
    if (Test-Path $activateScript) {
        & $activateScript
        pip install -e ".[dev]" --quiet 2>&1 | Out-Null
        Write-Success "Backend dependencies installed (pip install -e .[dev])"
    } else {
        Write-Warn "Could not activate venv. Install manually: pip install -e '.[dev]'"
    }
} catch {
    Write-Warn "Backend install had issues: $($_.Exception.Message)"
    Write-Warn "You can install manually: cd backend && pip install -e '.[dev]'"
}
Pop-Location

# ============================================================
# Step 4: Configure Environment Variables
# ============================================================
Write-Step "Configuring environment variables..."

$envLocal = "$ProjectRoot\.env.local"
$envExample = "$ProjectRoot\.env.example"

if (-not (Test-Path $envLocal)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envLocal
        Write-Success "Created .env.local from .env.example"
        Write-Warn "Edit .env.local with real credentials (ask SYSTEM_ADMIN)"
    } else {
        Write-Warn ".env.example not found. Create .env.local manually."
    }
} else {
    Write-Success ".env.local already exists"
}

# Also check frontend needs it
$frontendEnvLocal = "$ProjectRoot\frontend\.env.local"
if (-not (Test-Path $frontendEnvLocal)) {
    if (Test-Path $envLocal) {
        Copy-Item $envLocal $frontendEnvLocal
        Write-Success "Copied .env.local to frontend/.env.local"
    }
} else {
    Write-Success "frontend/.env.local already exists"
}

# ============================================================
# Step 5: Health Check — Lint & Typecheck & Build
# ============================================================
Write-Step "Running health checks..."

Push-Location "$ProjectRoot\frontend"

# Lint
Write-Host "   Running lint..." -ForegroundColor Gray
try {
    $lintOutput = npm run lint 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Lint passed"
    } else {
        Write-Warn "Lint has warnings (non-blocking)"
    }
} catch {
    Write-Warn "Lint check failed (non-blocking): $($_.Exception.Message)"
}

# Typecheck
Write-Host "   Running typecheck..." -ForegroundColor Gray
try {
    $typeOutput = npm run typecheck 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Typecheck passed"
    } else {
        Write-Warn "Typecheck has issues — review with: npm run typecheck"
    }
} catch {
    Write-Warn "Typecheck failed (review manually)"
}

# Build
Write-Host "   Running build..." -ForegroundColor Gray
try {
    $buildOutput = npm run build 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Build successful"
    } else {
        Write-Warn "Build failed — review with: npm run build"
    }
} catch {
    Write-Warn "Build failed (review manually)"
}

Pop-Location

# ============================================================
# Step 6: Backend Health Check
# ============================================================
Write-Step "Running backend health checks..."

Push-Location "$ProjectRoot\backend"
try {
    $activateScript = ".venv\Scripts\Activate.ps1"
    if (Test-Path $activateScript) {
        & $activateScript
        
        # Ruff check
        $ruffOutput = ruff check src/ 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Ruff lint passed"
        } else {
            Write-Warn "Ruff has warnings"
        }

        # Pytest (quick run)
        $pytestOutput = pytest tests/ --tb=no -q 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Backend tests passed"
        } else {
            Write-Warn "Some backend tests failed — review with: pytest tests/ -v"
        }
    } else {
        Write-Warn "Skipping backend checks (venv not activated)"
    }
} catch {
    Write-Warn "Backend checks skipped: $($_.Exception.Message)"
}
Pop-Location

# ============================================================
# Summary
# ============================================================
$EndTime = Get-Date
$Duration = $EndTime - $StartTime

Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "  Duration: $([math]::Round($Duration.TotalMinutes, 1)) minutes" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Edit .env.local with real DATABASE_URL (ask SYSTEM_ADMIN)"
Write-Host "  2. Run: cd frontend && npm run dev"
Write-Host "  3. Open: http://localhost:3000"
Write-Host "  4. Read: docs/onboarding.md"
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor White
Write-Host "    Frontend dev:    cd frontend && npm run dev"
Write-Host "    Frontend test:   cd frontend && npm run test"
Write-Host "    Frontend build:  cd frontend && npm run build"
Write-Host "    Backend test:    cd backend && pytest tests/"
Write-Host "    Backend lint:    cd backend && ruff check src/"
Write-Host ""
