# EC2 PMTiles Generation Guide

## 1. Launch EC2 Instance

**Recommended:** `c6i.4xlarge` (16 vCPU, 32GB RAM)

- **Spot pricing:** ~$0.30/hr (vs $1.36 on-demand)
- **Estimated time:** 2-3 hours for PMTiles generation
- **Estimated cost:** ~$1 total

**AMI:** Ubuntu 22.04 (recommended) or Amazon Linux 2023
**Storage:** 100GB gp3

## 2. Connect and Setup

### Ubuntu 22.04 (Recommended)

```bash
ssh -i your-key.pem ubuntu@<instance-ip>

# Install deps
sudo apt update
sudo apt install -y git gdal-bin libgdal-dev python3-pip

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Python deps
pip3 install rio-pmtiles rasterio numpy
```

### Amazon Linux 2023 (Alternative)

GDAL is not in default repos, use conda instead:

```bash
ssh -i your-key.pem ec2-user@<instance-ip>

# Install deps
sudo yum update -y
sudo yum install -y git

# Install miniforge for GDAL
curl -L -O https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh -b
~/miniforge3/bin/mamba init
source ~/.bashrc

# Install GDAL and Python deps via conda
mamba install -y gdal rasterio rio-pmtiles numpy

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

## 3. Clone and Build

```bash
git clone https://github.com/brandonfcohen1/gnarmap.git
cd gnarmap
bun install
bun run pipeline:build
```

## 4. Upload COGs from Local Machine

Since you already have COGs locally, copy them to EC2:

```bash
# From your local machine (not EC2)
scp -i "gnarmapec2.epm" -r ./packages/pipeline/output ec2-user@<ip>:~/gnarmap/packages/pipeline/
```

Or upload to R2 first, then sync to EC2:

```bash
# Local: upload COGs to R2
rclone sync ./packages/pipeline/output r2:gnarmap-historical/cogs/

# EC2: download from R2 (faster than SCP)
rclone sync r2:gnarmap-historical/cogs/ ./packages/pipeline/output/
```

## 5. Configure rclone for R2

```bash
curl https://rclone.org/install.sh | sudo bash
mkdir -p ~/.config/rclone
```

**Option A:** Copy config from local machine (run from local, not EC2):
```bash
scp -i "gnarmapec2.pem" ~/.config/rclone/rclone.conf ec2-user@<instance-ip>:~/.config/rclone/
```

**Option B:** Create config manually on EC2:
```bash
cat > ~/.config/rclone/rclone.conf << 'EOF'
[r2]
type = s3
provider = Cloudflare
access_key_id = YOUR_R2_ACCESS_KEY
secret_access_key = YOUR_R2_SECRET_KEY
endpoint = https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
EOF
```

## 6. Generate PMTiles

**Important:** You must activate the conda environment first so the `rio` command is available.

```bash
cd ~/gnarmap/packages/pipeline/scripts

# Activate conda environment (required for rio-pmtiles)
source ~/miniforge3/bin/activate

# Run with nohup so it continues after disconnect
nohup python generate_pmtiles.py --batch ../output ../pmtiles-output --workers 8 > ~/pmtiles.log 2>&1 &
```

## 7. Monitor Progress

```bash
# Watch the log file
tail -f ~/pmtiles.log

# Check how many PMTiles have been generated
ls ~/gnarmap/packages/pipeline/pmtiles-output/ | wc -l

# Check how many COGs exist (total to process)
ls ~/gnarmap/packages/pipeline/output/*.tif | wc -l

# Check if the process is still running
ps aux | grep python
```

## 8. Stopping and Restarting

If you need to stop and restart the script:

```bash
# Kill the running process
pkill -f generate_pmtiles

# Clear the log (optional, to see fresh output)
> ~/pmtiles.log

# Restart (must activate conda first!)
cd ~/gnarmap/packages/pipeline/scripts
source ~/miniforge3/bin/activate
nohup python generate_pmtiles.py --batch ../output ../pmtiles-output --workers 8 > ~/pmtiles.log 2>&1 &
tail -f ~/pmtiles.log
```

The script automatically skips existing PMTiles, so it's safe to restart.

## 9. Sync to R2

```bash
rclone sync ~/gnarmap/packages/pipeline/pmtiles-output/ r2:gnarmap-historical/pmtiles/
```

## 10. Handling Disk Full Errors

If you run out of disk space (100GB may not be enough for all PMTiles):

```bash
# Check disk usage
df -h

# Sync existing PMTiles to R2
rclone sync ~/gnarmap/packages/pipeline/pmtiles-output/ r2:gnarmap-historical/pmtiles/

# Delete local PMTiles to free space
rm ~/gnarmap/packages/pipeline/pmtiles-output/*.pmtiles

# Restart the script (it skips files already in output dir, but they're gone now)
# The script will regenerate them - consider syncing in smaller batches
```

You may need to repeat this process in batches until all PMTiles are generated and synced.

## Time Estimates

| Task               | Time (c6i.4xlarge) |
| ------------------ | ------------------ |
| SCP COGs to EC2    | 30-60 min          |
| PMTiles generation | 2-3 hours          |
| R2 sync            | 30-60 min          |
| **Total**          | **3-5 hours**      |

## Alternative: Run Locally

If you prefer not to use EC2, you can run PMTiles generation locally (slower):

```bash
cd packages/pipeline/scripts
WORKERS=4 ./backfill.sh pmtiles
./backfill.sh sync
```

This will take longer (~8-12 hours) but avoids EC2 setup.
