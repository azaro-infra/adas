# Run Cabin Assistant on your laptop

Cabin Assistant lets you ask questions about a video frame, read simulated vehicle information, and change a simulated cabin temperature. You can inspect the actual NVIDIA NeMo tool calls and their results. The included sample video works without a webcam.

Everything runs on your laptop after installation. You do not need a cloud API key, NVIDIA account, paid service, or automotive hardware. This project uses NeMo Agent Toolkit; it does not install DriveOS or control a car.

Choose your instructions: [macOS](#macos) or [Windows PowerShell](#windows-powershell).

## Before you start

- **macOS:** macOS 14 or newer. Apple Silicon is recommended and has been tested. Ollama supports Intel Macs with CPU-only inference, but this project has not been verified on Intel.
- **Windows:** Windows 10 22H2 or newer, or Windows 11, on an x64 laptop. Native Windows ARM is not covered. A GPU supported by Ollama improves inference speed; CPU-only execution can exceed the demo's 180-second timeout.
- **Memory:** 16 GB or more is a practical starting recommendation, not a tested minimum. The original real-model checks used an Apple Silicon Mac with 24 GB RAM.
- **Disk and network:** allow roughly 20 GB free as setup headroom for tools, dependencies, and weights. The default model download is approximately 3.3 GB. Initial installation requires internet access.
- **Tools:** Git, Node.js **22 LTS or 24 LTS**, uv, and Ollama. uv downloads Python **3.12** automatically; you do not need to activate a virtual environment or install Python separately.

Use the current native Ollama release. The original model checks used Ollama 0.32.5. These instructions do not establish compatibility with every laptop/GPU. Automated dependency, unit-test, and build results appear in [Laptop checks](https://github.com/azaro-infra/adas/actions/workflows/ci.yml); those checks do not run Ollama inference.

## macOS

### 1. Install the prerequisites

1. Install Git with Apple's Command Line Tools if it is not already available: run `xcode-select --install` in Terminal and finish the installer.
2. Install Node.js 22 LTS or 24 LTS from [nodejs.org](https://nodejs.org/en/download). If you use nvm, the repository's `.nvmrc` selects Node 22.
3. Install [Ollama for macOS](https://ollama.com/download/mac). Move it into Applications and open it once to complete CLI setup.
4. Install uv using its [official installer](https://docs.astral.sh/uv/getting-started/installation/):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Open a new Terminal window so the installed commands are on PATH, then check:

```bash
git --version
node --version
npm --version
uv --version
ollama --version
```

### 2. Download the project and install dependencies

Run these commands from the folder where you want to keep the project:

```bash
git clone https://github.com/azaro-infra/adas.git
cd adas
npm ci
uv sync --project backend --locked
```

Keep the clone in this location. In each additional Terminal window, use `cd` to open this same `adas` directory.

### 3. Start three services

**Terminal 1 — Ollama:** quit the existing Ollama application from its menu-bar icon, then run from `adas`:

```bash
npm run ollama
```

This starts a foreground Ollama server with `OLLAMA_NO_CLOUD=1` and `OLLAMA_HOST=127.0.0.1:11434`. Keep this terminal open.

**Terminal 2 — model download and NeMo agent:**

```bash
ollama pull qwen3-vl:4b-instruct
npm run agent
```

Wait for the download to finish and the agent to report `Application startup complete` on port 8000. The download is needed only once.

**Terminal 3 — dashboard:**

```bash
npm run dev
```

Wait for Next.js to report that it is ready, then open **http://127.0.0.1:3000**. Continue with [Try the demo](#try-the-demo).

## Windows PowerShell

These steps run all three services natively on Windows. Use **PowerShell**, not Command Prompt or a WSL terminal. The commands use `npm.cmd` so you do not need to relax PowerShell's script execution policy.

### 1. Install the prerequisites

1. Install [Git for Windows](https://git-scm.com/downloads/win), keeping the option that makes Git available from the command line.
2. Install Node.js 22 LTS or 24 LTS from [nodejs.org](https://nodejs.org/en/download), using the Windows x64 installer.
3. Install [Ollama for Windows](https://ollama.com/download/windows). It starts in the system tray after installation.
4. Install uv using WinGet in PowerShell:

```powershell
winget install --id astral-sh.uv --exact
```

If WinGet is unavailable, use one of the alternatives in the [official uv Windows installation guide](https://docs.astral.sh/uv/getting-started/installation/).

Open a new PowerShell window after installation, then check:

```powershell
git --version
node --version
npm.cmd --version
uv --version
ollama --version
```

### 2. Download the project and install dependencies

Run these commands from the folder where you want to keep the project:

```powershell
git clone https://github.com/azaro-infra/adas.git
Set-Location adas
npm.cmd ci
uv sync --project backend --locked
```

In every additional PowerShell window, use `Set-Location` to open the same cloned `adas` directory. Do not copy a Python virtual environment or `node_modules` from another computer.

### 3. Start three services

**PowerShell 1 — Ollama:** right-click the Ollama system-tray icon and select **Quit Ollama**, then run from `adas`:

```powershell
npm.cmd run ollama
```

The npm script sets the local-only environment variables correctly for Windows and starts Ollama on `127.0.0.1:11434`. Keep this window open.

**PowerShell 2 — model download and NeMo agent:**

```powershell
ollama pull qwen3-vl:4b-instruct
npm.cmd run agent
```

Wait for the download to finish and the agent to report `Application startup complete` on port 8000. The model download is needed only once.

**PowerShell 3 — dashboard:**

```powershell
npm.cmd run dev
```

Wait for Next.js to report that it is ready, then open **http://127.0.0.1:3000** in Edge or Chrome.

NVIDIA currently lists native Windows x64 NeMo support as untested upstream, while WSL2 x64 is tested. This repository runs its own Windows CI checks; see their result before relying on native compatibility. Do not mix a WSL backend with a Windows Ollama server using these instructions: all model URLs are fixed to loopback. [NVIDIA platform support](https://docs.nvidia.com/nemo/agent-toolkit/latest/get-started/installation.html#supported-platforms)

## Try the demo

1. Open **http://127.0.0.1:3000** and click **Refresh** if the services were started after the page loaded.
2. The included street-traffic clip should load. Press Play if your browser blocks autoplay, then pause on a clear frame. **Load sample clip** restores it after you choose another source.
3. Ask **“Describe the visible vehicles and tell me the simulated battery level.”** Wait for the answer. The first request can take longer while the model loads.
4. Inspect the tool trace. You should see `inspect_frame` and `read_vehicle_status`; expand **Result returned to the model** to see the actual results.
5. Ask **“Set the cabin temperature to 20 °C.”** The temperature should change to 20 °C, with an applied `set_cabin_temperature` result.
6. Optionally enable automatic observation. It samples a new frame eight seconds after the previous answer completes. It does not continuously track video or modify vehicle state.

Your own MP4/WebM or webcam can also be used. The browser sends only a resized still JPEG to the local backend. Webcam use requires browser permission; the bundled video does not.

### Check the complete local pipeline

With all three services running, open a fourth terminal in `adas`:

```bash
# macOS
npm run test:local
```

```powershell
# Windows PowerShell
npm.cmd run test:local
```

This uses the included text-card image to test vision plus telemetry, then tests a temperature change. Successful output ends with:

```text
PASS: NVIDIA NeMo native tool loop, local vision, telemetry, and applied simulator change.
```

This verifies integration with your installed model. It does not certify the accuracy of road-scene descriptions. For developer tests without Ollama, see [Verification](../README.md#verification).

## Stop and restart

Press **Ctrl+C** in each service terminal. The downloaded model stays on disk; browser simulation state resets when you reload the page.

Next time, open the cloned directory in three terminals and run `npm run ollama`, `npm run agent`, and `npm run dev` respectively. Use `npm.cmd` in PowerShell. You do not need to reinstall dependencies or download the model again unless you update the project or change models.

## Troubleshooting

- **A command is not recognized:** reopen your terminal after installing tools. Confirm the version commands above work. On macOS, open the Ollama app once to complete CLI setup.
- **PowerShell blocks `npm.ps1`:** use `npm.cmd` for every npm command. You do not need to change execution policy.
- **Port 11434 is already in use:** quit Ollama from the menu bar or system tray before `npm run ollama`; another foreground Ollama terminal may also already be running.
- **Model missing / unable to connect to Ollama:** keep terminal 1 running, then run `ollama list`. It must include the exact tag `qwen3-vl:4b-instruct`. Use `ollama pull qwen3-vl:4b-instruct` if missing.
- **NeMo unavailable:** inspect terminal 2, confirm `uv sync --project backend --locked` succeeded, and restart `npm run agent`. The backend uses Python 3.12 from `backend/.python-version`.
- **Port 3000 or 8000 is occupied:** stop the other process using that port, then restart. Keep the dashboard at port 3000 so the supplied smoke tests use the correct address.
- **Slow inference / timeout:** close memory-heavy applications, run `ollama ps` after a request to inspect CPU/GPU use, and check Activity Monitor or Task Manager. GPU support depends on hardware and drivers; see [Ollama GPU support](https://docs.ollama.com/gpu). Intel Macs use CPU inference. Smaller-model instructions are in [Change the model](../README.md#change-the-model), but only the default 4B has been validated here.
- **Wrong answer / tool iteration limit:** retry a short, explicit question. Small local models can misread images or choose the wrong tools. The UI keeps its previous state when a request fails.
- **Webcam unavailable:** use the bundled sample or a local MP4/WebM instead. Check browser camera permissions if you need the webcam.
- **Private repository clone is denied:** authenticate Git with a GitHub account that has repository access. Repository access and local inference are separate; no GitHub credential is needed by the running application.

## Upstream references

- [Ollama macOS requirements](https://docs.ollama.com/macos)
- [Ollama Windows requirements](https://docs.ollama.com/windows)
- [uv installation](https://docs.astral.sh/uv/getting-started/installation/)
- [NVIDIA NeMo Agent Toolkit platform support](https://docs.nvidia.com/nemo/agent-toolkit/latest/get-started/installation.html#supported-platforms)
