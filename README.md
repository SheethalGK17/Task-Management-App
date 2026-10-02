# TaskFlow

TaskFlow is an offline-first task management mobile application built with React Native and Expo. It lets users create, organize, track, import, and export tasks without a backend.

## Highlights

- Create, edit, complete, view, and delete tasks
- Dashboard with total, completed, pending, and today's task counts
- Search, status filters, date filters, and sorting
- CSV bulk import with validation, duplicate handling, and import summary
- CSV export through the device share sheet
- Persistent local storage with AsyncStorage
- Light and dark mode
- Responsive mobile-first interface

## Tech Stack

| Technology | Purpose |
| --- | --- |
| React Native | Cross-platform mobile UI |
| Expo SDK 57 | Development environment and native module support |
| JavaScript | Application logic |
| AsyncStorage | Persistent on-device task storage |
| Expo FileSystem | CSV import, parsing, and file creation |
| Expo Sharing | Exported CSV share sheet |
| React Native DateTimePicker | Calendar date selection |
| React Native Animated and PanResponder | Swipe-to-delete interaction |

## Architecture

The application follows a simple single-screen architecture suitable for an offline assessment project.

```text
App.js
├── Application state
│   ├── tasks, filters, sort order, theme, modals
│   └── AsyncStorage load/save lifecycle
├── Reusable form controls
│   ├── FormField
│   ├── FormChoice
│   └── FormDateField
├── Task management logic
│   ├── create, edit, complete, delete
│   ├── search, filter, sort, overdue detection
│   └── CSV import/export and duplicate prevention
└── UI screens
    ├── Dashboard
    ├── My Tasks
    ├── Bulk Upload
    ├── Settings
    ├── Add/Edit Task modal
    └── Task Details modal
```

All task data is stored locally under the AsyncStorage key `@taskflow_tasks`. No backend, account, or network database is required.

## Features

### Dashboard

- Displays total, completed, pending, and today's task counts
- Shows upcoming pending tasks
- Provides quick navigation to CSV bulk upload
- Includes a floating `+` action for task creation

### Task Management

- Add task title, description, category, priority, start date, due date, and status
- Edit or delete any task
- Mark tasks completed or pending from the list and details view
- Validate that a due date is not earlier than the start date
- Type dates as `YYYY-MM-DD` or choose them from a native calendar
- Highlight incomplete tasks that are overdue

### My Tasks

- Search by title, category, or priority
- Filter by all, pending, or completed status
- Filter tasks using a selected calendar date
- Sort by due date, start date, priority, or title
- Swipe a task card left to reveal a delete action

### CSV Import

- Select a CSV file using the device file picker
- Supports headered and headerless CSV files
- Validates every record and displays invalid row errors
- Imports valid records while skipping duplicates
- Accepts common spreadsheet header names such as `Task Name`, `Start Date`, `Due Date`, and `Deadline`
- Normalizes common date formats, priorities, and statuses where possible
- Displays imported, skipped, and auto-corrected record counts

### CSV Export

- Export every saved task from **Settings → Export tasks to CSV**
- Creates a CSV using the same task fields as the importer
- Opens the device share sheet so the file can be saved or shared

### Settings

- Toggle light and dark mode
- Export all tasks to CSV
- Clear all locally stored tasks after confirmation

## CSV Format

The expected field order for a CSV without headers is:

```csv
id,title,description,category,priority,start_date,due_date,status
```

Example:

```csv
1,Prepare report,Create the weekly report,Work,High,2026-10-01,2026-10-03,pending
```

The sample [tasks.csv](./tasks.csv) file is included in this repository. Its records are imported dynamically; no sample task data is hard-coded in the application.

For a spreadsheet workbook, export it first as **CSV UTF-8 (Comma delimited) (*.csv)** before importing.

## Getting Started

### Prerequisites

- Expo Go installed on an Android or iOS device, or an Android emulator
- Phone and computer connected to the same Wi-Fi network for LAN testing

### Install and Run

```bash
npm install
npx expo start --lan --clear
```

Then:

1. Open Expo Go on the phone.
2. Scan the QR code shown in the terminal.
3. Keep the terminal running while using the app.

Useful commands:

```bash
npm run android
npm run web
npm run lint
```

If the phone cannot connect over LAN, make sure both devices use the same Wi-Fi and allow Node.js through Windows Firewall. As a fallback, run:

```bash
npx expo start --tunnel
```

## Importing the Sample CSV on a Phone

1. Copy or download `tasks.csv` onto the phone.
2. Save it in the phone's **Downloads** folder.
3. Open **Bulk Upload** in TaskFlow.
4. Select the file through the system picker.
5. Review the import summary.

## Building an Android APK

Use Expo Application Services (EAS):

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```


