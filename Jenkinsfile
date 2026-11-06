pipeline {
  agent any

  environment {
    IMAGE_NAME = 'student-attendance-management:latest'
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Install dependencies') {
      steps { sh 'npm install' }
    }

    stage('Syntax check') {
      steps {
        sh 'node --check server.js'
        sh 'node --check public/script.js'
        sh 'node --check database/database.js'
      }
    }

    stage('Tests') {
      steps { sh 'npm test' }
    }

    stage('Build Docker image') {
      steps { sh 'docker build -t $IMAGE_NAME .' }
    }
  }

  post {
    success { echo 'Build and tests completed successfully.' }
    failure { echo 'Pipeline failed. Check the stage logs.' }
  }
}