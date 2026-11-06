# Student Attendance Management System using DevOps Tools

A seven-period, date-wise student attendance application with monthly reports, CSV export, and individual student history.

## Technology
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js and Express
- Database: SQLite (`node:sqlite`)
- DevOps: GitHub, Jenkins, Docker, Kubernetes
- UI automation: Selenium WebDriver with Chrome

## Requirements
- Node.js 22.5 or newer (Node 22 LTS or newer recommended)
- npm
- Google Chrome for Selenium browser test
- Docker for container build
- Jenkins with Node/npm and Docker available on its agent
- Kubernetes cluster for Kubernetes deployment

## Run locally on Windows
1. Extract this ZIP.
2. Open the extracted `Student-Attendance-Management-DevOps` folder in VS Code.
3. Open **Terminal → New Terminal**. If PowerShell blocks `npm.ps1`, choose **Command Prompt** from the terminal profile menu.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000`.
6. Keep the terminal running while using the site.

The SQLite database is created automatically at `database/attendance.db`. Do not delete this file if you want to keep attendance data.

## Features
1. Add students with unique roll number, name, and department.
2. Mark Present/Absent for seven periods per student per date.
3. Mark all students Present or Absent.
4. Save and reload attendance by date; corrections update existing records.
5. Monthly totals, attendance percentage, and low-attendance flag.
6. Export monthly report as CSV.
7. Individual student attendance history.

**Calculation note:** working periods are the attendance records saved in the selected month. Unrecorded periods are not counted as working periods.

## Test
Run API tests:
```bash
npm test
```
For the Selenium smoke test, keep the app running in one terminal, then run in another:
```bash
npm install
npm run test:e2e
```
Selenium Manager may download a compatible ChromeDriver the first time. Chrome must be installed.

## Docker
Build and run:
```bash
docker compose up --build
```
Open `http://localhost:3000`. Docker Compose stores SQLite data in the named volume `attendance-data`.

To stop:
```bash
docker compose down
```
Do not use `docker compose down -v` unless you intentionally want to delete the database volume.

## Jenkins
1. Push the project to GitHub.
2. In Jenkins, create a Pipeline job.
3. Connect the GitHub repository and select `Jenkinsfile` from SCM.
4. Ensure the Jenkins agent has Node.js/npm and Docker installed and permission to run Docker.
5. Run Build Now. Pipeline stages: checkout, install, syntax check, tests, Docker image build.

The pipeline builds a local Docker image on the Jenkins agent. It does not push to a registry or deploy automatically.

## Kubernetes
Build the image in a way your cluster can access. For a local Minikube cluster:
```bash
docker build -t student-attendance-management:latest .
minikube image load student-attendance-management:latest
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl get pods
kubectl get services
```
Open the service:
```bash
minikube service student-attendance-service
```
The PersistentVolumeClaim mounts `/app/database` so the SQLite database can survive pod restarts. This single-replica SQLite setup is suitable for a student/demo project, not a horizontally scaled production deployment.

## GitHub browser upload
Upload the extracted project files and folders to your existing repository. Include `public`, `database` (the folder can contain only `database.js`; the database file is generated at runtime), `tests`, `k8s`, and root files. Do not upload `node_modules` or `database/attendance.db`.
