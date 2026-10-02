import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

const STORAGE_KEY = "@taskflow_tasks";
const today = new Date().toISOString().slice(0, 10);
const emptyTask = {
  title: "",
  description: "",
  category: "Personal",
  priority: "Medium",
  start_date: today,
  due_date: today,
  status: "pending",
};
const cols = [
  "id",
  "title",
  "description",
  "category",
  "priority",
  "start_date",
  "due_date",
  "status",
];

const headerAliases = {
  id: "id",
  task_id: "id",
  title: "title",
  task: "title",
  task_title: "title",
  name: "title",
  description: "description",
  details: "description",
  notes: "description",
  category: "category",
  type: "category",
  priority: "priority",
  start_date: "start_date",
  start: "start_date",
  startdate: "start_date",
  due_date: "due_date",
  due: "due_date",
  deadline: "due_date",
  end_date: "due_date",
  status: "status",
  state: "status",
};

function normaliseHeader(value) {
  return headerAliases[
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
  ];
}

function normaliseDate(value) {
  const raw = String(value || "").trim();
  if (isValidDate(raw)) return raw;

  if (/^\d{5}$/.test(raw)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000);
    const formatted = date.toISOString().slice(0, 10);
    return isValidDate(formatted) ? formatted : "";
  }

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const [, first, second, year] = match;
    const day = Number(second) > 12 ? second : first;
    const month = Number(second) > 12 ? first : second;
    const formatted = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isValidDate(formatted) ? formatted : "";
  }

  const reverseMatch = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (reverseMatch) {
    const [, year, month, day] = reverseMatch;
    const formatted = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isValidDate(formatted) ? formatted : "";
  }
  return "";
}

function normalisePriority(value) {
  const priority = String(value || "").trim().toLowerCase();
  if (["high", "urgent", "1"].includes(priority)) return "High";
  if (["low", "3"].includes(priority)) return "Low";
  return "Medium";
}

function normaliseStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["completed", "complete", "done", "yes", "true", "1"].includes(status)
    ? "completed"
    : "pending";
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      next = text[i + 1];
    if (c === '"' && quote && next === '"') {
      cell += '"';
      i++;
    } else if (c === '"') quote = !quote;
    else if (c === delimiter && !quote) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  const header = rows[0]?.map(normaliseHeader);
  const hasHeader = header?.includes("title");
  const keys = hasHeader ? header : cols;
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r, index) => Object.fromEntries(keys.map((k, i) => [k, r[i] || ""])))
    .map((x, index) => ({ ...x, _row: index + (hasHeader ? 2 : 1) }));
}

function FormField({
  label,
  value,
  field,
  onChange,
  theme,
  multiline = false,
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.sub }]}>{label}</Text>
      <TextInput
        value={value}
        multiline={multiline}
        onChangeText={(text) => onChange(field, text)}
        placeholderTextColor={theme.sub}
        style={[
          styles.input,
          {
            color: theme.text,
            borderColor: theme.line,
            minHeight: multiline ? 96 : 50,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
    </View>
  );
}

function FormChoice({ label, values, field, value, onChange, theme }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.sub }]}>{label}</Text>
      <View style={styles.choices}>
        {values.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(field, option)}
            style={[
              styles.choice,
              {
                borderColor: value === option ? theme.accent : theme.line,
                backgroundColor: value === option ? theme.pale : theme.card,
              },
            ]}
          >
            <Text
              style={{
                color: theme.text,
                fontWeight: value === option ? "700" : "500",
              }}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FormDateField({ label, value, field, onChange, theme, minimumDate }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.sub }]}>{label}</Text>
      <View style={styles.dateInputRow}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(field, text)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.sub}
          style={[
            styles.dateInput,
            { color: theme.text, borderColor: theme.line },
          ]}
        />
        <Pressable
          accessibilityLabel={`Choose ${label} from calendar`}
          onPress={() => setShowCalendar(true)}
          style={[
            styles.calendarButton,
            { backgroundColor: theme.pale, borderColor: theme.accent },
          ]}
        >
          <Text style={styles.calendarIcon}>📅</Text>
        </Pressable>
      </View>
      {showCalendar && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onValueChange={(event, date) => {
            setShowCalendar(false);
            if (date) onChange(field, formatLocalDate(date));
          }}
          onDismiss={() => setShowCalendar(false)}
        />
      )}
    </View>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]),
    [ready, setReady] = useState(false),
    [dark, setDark] = useState(false);
  const [tab, setTab] = useState("Home"),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState(""),
    [sortBy, setSortBy] = useState("due_date"),
    [dateFilter, setDateFilter] = useState(""),
    [showDateFilter, setShowDateFilter] = useState(false);
  const [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [importInfo, setImportInfo] = useState(null);
  const theme = dark
    ? {
        bg: "#111827",
        card: "#1f2937",
        text: "#f9fafb",
        sub: "#9ca3af",
        line: "#374151",
        accent: "#f6b94c",
        pale: "#2b3240",
      }
    : {
        bg: "#f7f8fc",
        card: "#ffffff",
        text: "#172033",
        sub: "#6b7280",
        line: "#e7e9ee",
        accent: "#e4a83e",
        pale: "#fff7e7",
      };
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((x) => {
        if (x) setTasks(JSON.parse(x));
      })
      .catch(() => Alert.alert("Storage error", "Could not load saved tasks."))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, ready]);
  const add = () => {
    setForm({ ...emptyTask, id: "" });
    setDetail(null);
  };
  const save = () => {
    if (!form.title.trim())
      return Alert.alert("Title required", "Please enter a task title.");
    if (
      !isValidDate(form.start_date) ||
      !isValidDate(form.due_date)
    )
      return Alert.alert("Invalid date", "Use YYYY-MM-DD format.");
    if (form.due_date < form.start_date)
      return Alert.alert(
        "Invalid dates",
        "Due date cannot be earlier than the start date.",
      );
    const task = {
      ...form,
      id: form.id || String(Date.now()),
      title: form.title.trim(),
    };
    setTasks((x) =>
      x.some((t) => t.id === task.id)
        ? x.map((t) => (t.id === task.id ? task : t))
        : [task, ...x],
    );
    setForm(null);
  };
  const remove = (id) =>
    Alert.alert("Delete task?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setTasks((x) => x.filter((t) => t.id !== id));
          setDetail(null);
        },
      },
    ]);
  const toggle = (id) =>
    setTasks((x) =>
      x.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "completed" ? "pending" : "completed" }
          : t,
      ),
    );
  const stats = useMemo(
    () => ({
      total: tasks.length,
      done: tasks.filter((t) => t.status === "completed").length,
      pending: tasks.filter((t) => t.status !== "completed").length,
      today: tasks.filter((t) => t.start_date === today || t.due_date === today)
        .length,
    }),
    [tasks],
  );
  const shown = useMemo(() => {
    const priorityOrder = { High: 1, Medium: 2, Low: 3 };
    return tasks
      .filter(
        (t) =>
          (filter === "All" || t.status === filter.toLowerCase()) &&
          (!dateFilter ||
            t.start_date === dateFilter ||
            t.due_date === dateFilter) &&
          `${t.title} ${t.category} ${t.priority}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) =>
        sortBy === "priority"
          ? priorityOrder[a.priority] - priorityOrder[b.priority]
          : String(a[sortBy]).localeCompare(String(b[sortBy])),
      );
  }, [tasks, filter, search, sortBy, dateFilter]);
  const exportTasks = async () => {
    if (!tasks.length) {
      Alert.alert("No tasks to export", "Create or import a task first.");
      return;
    }
    try {
      const csv = [cols.join(","), ...tasks.map((task) => cols.map((key) => csvValue(task[key])).join(","))].join("\n");
      const exportFile = new File(Paths.document, `TaskFlow-tasks-${today}.csv`);
      exportFile.create({ intermediates: true, overwrite: true });
      exportFile.write(csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportFile.uri, {
          dialogTitle: "Export TaskFlow tasks",
          mimeType: "text/csv",
        });
      } else {
        Alert.alert("CSV exported", `Saved as ${exportFile.name} in TaskFlow documents.`);
      }
    } catch (error) {
      console.warn("CSV export failed", error);
      Alert.alert("Export failed", "Could not create the CSV file.");
    }
  };
  const importFile = async () => {
    try {
      const pick = await File.pickFileAsync({
        multipleFiles: false,
        mimeTypes: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
      });
      if (pick.canceled) return;
      const file = pick.result;
      if (!file) throw new Error("No file was received from the file picker.");

      const content = await file.text();
      if (!content.trim()) {
        setImportInfo({
          name: file.name,
          total: 0,
          imported: 0,
          duplicates: 0,
          errors: ["The selected CSV file is empty."],
        });
        return;
      }
      if (content.startsWith("PK") || content.includes("\0")) {
        Alert.alert(
          "CSV content required",
          "This looks like an Excel workbook. In Excel, use Save As → CSV UTF-8 (Comma delimited) and select that exported file.",
        );
        return;
      }
      const records = parseCsv(content);
      const errors = [],
        valid = [];
      let corrected = 0;
      records.forEach((raw) => {
        const r = {
          ...raw,
          title: String(raw.title || "").trim(),
          description: String(raw.description || "").trim(),
          category: String(raw.category || "").trim() || "General",
          priority: normalisePriority(raw.priority),
          status: normaliseStatus(raw.status),
          start_date: normaliseDate(raw.start_date || raw.due_date),
          due_date: normaliseDate(raw.due_date || raw.start_date),
        };
        const changed =
          r.category !== String(raw.category || "").trim() ||
          r.priority.toLowerCase() !== String(raw.priority || "").trim().toLowerCase() ||
          r.status !== String(raw.status || "").trim().toLowerCase() ||
          r.start_date !== String(raw.start_date || "").trim() ||
          r.due_date !== String(raw.due_date || "").trim();
        if (changed) corrected += 1;

        if (!r.title || !isValidDate(r.start_date) || !isValidDate(r.due_date) || r.due_date < r.start_date)
          errors.push(
            `Row ${r._row}: ${!r.title ? "a task title is required" : !isValidDate(r.start_date) || !isValidDate(r.due_date) ? "a valid start and due date are required" : "due date is before start date"}`,
          );
        else
          valid.push({
            id: r.id || String(Date.now() + valid.length),
            title: r.title,
            description: r.description,
            category: r.category,
            priority:
              r.priority[0].toUpperCase() + r.priority.slice(1).toLowerCase(),
            start_date: r.start_date,
            due_date: r.due_date,
            status: r.status.toLowerCase(),
          });
      });
      const existingIds = new Set(tasks.map((t) => String(t.id)));
      const existingRecords = new Set(
        tasks.map((t) => `${t.title.trim().toLowerCase()}|${t.due_date}`),
      );
      const unique = valid.filter((task) => {
        const recordKey = `${task.title.trim().toLowerCase()}|${task.due_date}`;
        if (existingIds.has(String(task.id)) || existingRecords.has(recordKey)) {
          return false;
        }
        existingIds.add(String(task.id));
        existingRecords.add(recordKey);
        return true;
      });
      const duplicates = valid.length - unique.length;
      setTasks((x) => [...unique, ...x]);
      setImportInfo({
        name: file.name,
        total: records.length,
        imported: unique.length,
        duplicates,
        errors,
        corrected,
      });
    } catch (error) {
      console.warn("CSV import failed", error);
      Alert.alert(
        "Import failed",
        error?.message ||
          "The CSV could not be read. Download it to your phone, then try again.",
      );
    }
  };
  const updateForm = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));
  const TaskRow = ({ item }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) =>
          translateX.setValue(Math.min(0, Math.max(-92, gesture.dx))),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -58) {
            Animated.spring(translateX, { toValue: -92, useNativeDriver: true }).start();
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    ).current;
    const overdue = item.status !== "completed" && item.due_date < today;
    return (
      <View style={styles.swipeRow}>
        <Pressable onPress={() => remove(item.id)} style={styles.swipeDelete}>
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </Pressable>
        <Animated.View
          {...panResponder.panHandlers}
          style={{ transform: [{ translateX }] }}
        >
          <Pressable
            onPress={() => setDetail(item)}
            style={[
              styles.task,
              { backgroundColor: theme.card, borderColor: theme.line },
            ]}
          >
      <Pressable
        onPress={() => toggle(item.id)}
        style={[
          styles.check,
          {
            borderColor:
              item.status === "completed" ? theme.accent : theme.line,
            backgroundColor:
              item.status === "completed" ? theme.accent : "transparent",
          },
        ]}
      >
        <Text style={styles.checkText}>
          {item.status === "completed" ? "✓" : ""}
        </Text>
      </Pressable>
      <View style={styles.taskBody}>
        <View style={styles.taskTop}>
          <Text
            numberOfLines={1}
            style={[
              styles.taskTitle,
              {
                color: theme.text,
                textDecorationLine:
                  item.status === "completed" ? "line-through" : "none",
              },
            ]}
          >
            {item.title}
          </Text>
          <View
            style={[
              styles.priority,
              {
                backgroundColor:
                  item.priority === "High"
                    ? "#fee2e2"
                    : item.priority === "Medium"
                      ? theme.pale
                      : "#dcfce7",
              },
            ]}
          >
            <Text
              style={[
                styles.priorityText,
                {
                  color:
                    item.priority === "High"
                      ? "#b91c1c"
                      : item.priority === "Medium"
                        ? "#9a6700"
                        : "#15803d",
                },
              ]}
            >
              {item.priority}
            </Text>
          </View>
          {overdue && (
            <View style={styles.overdue}>
              <Text style={styles.overdueText}>Overdue</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.sub }]}>
          {item.category} • Start {item.start_date} • Due {item.due_date}
        </Text>
      </View>
      <Pressable
        onPress={() => remove(item.id)}
        hitSlop={12}
        style={styles.deleteButton}
      >
        <Text style={styles.delete}>×</Text>
      </Pressable>
          </Pressable>
        </Animated.View>
      </View>
    );
  };
  const Header = ({ title, right }) => (
    <View style={styles.header}>
      <Text style={[styles.heading, { color: theme.text }]}>{title}</Text>
      {right}
    </View>
  );
  const Home = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <Header title="Good day 👋" />
      <Text style={[styles.lead, { color: theme.sub }]}>
        Stay focused. Every task is progress.
      </Text>
      <View style={styles.grid}>
        {[
          ["Total tasks", stats.total],
          ["Completed", stats.done],
          ["Pending", stats.pending],
          ["Today's tasks", stats.today],
        ].map(([a, b]) => (
          <View
            key={a}
            style={[
              styles.stat,
              { backgroundColor: theme.card, borderColor: theme.line },
            ]}
          >
            <Text style={[styles.statNum, { color: theme.text }]}>{b}</Text>
            <Text style={[styles.meta, { color: theme.sub }]}>{a}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.callout, { backgroundColor: theme.pale }]}>
        <Text style={[styles.calloutTitle, { color: theme.text }]}>
          Keep your momentum going
        </Text>
        <Text style={{ color: theme.sub }}>
          Create tasks, set priorities, and close out your day with clarity.
        </Text>
        <Pressable
          onPress={() => setTab("Bulk")}
          style={[styles.outline, { borderColor: theme.accent }]}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            Import tasks from CSV
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.section, { color: theme.text }]}>
        Upcoming tasks
      </Text>
      {tasks
        .filter((t) => t.status !== "completed")
        .slice(0, 3)
        .map((t) => (
          <TaskRow key={t.id} item={t} />
        ))}
      {!tasks.length && (
        <Text style={[styles.empty, { color: theme.sub }]}>
          No tasks yet. Tap + to create your first one.
        </Text>
      )}
    </ScrollView>
  );
  const List = () => (
    <ScrollView
      contentContainerStyle={[styles.screen, styles.listContent]}
      showsVerticalScrollIndicator={false}
    >
      <Header title="My Tasks" />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search tasks..."
        placeholderTextColor={theme.sub}
        style={[
          styles.search,
          {
            color: theme.text,
            borderColor: theme.line,
            backgroundColor: theme.card,
          },
        ]}
      />
      <View style={styles.filterWrap}>
        {["All", "Pending", "Completed"].map((x) => (
          <Pressable
            key={x}
            onPress={() => setFilter(x)}
            style={[
              styles.pill,
              {
                backgroundColor: filter === x ? theme.accent : theme.card,
                borderColor: filter === x ? theme.accent : theme.line,
              },
            ]}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {x}{" "}
              <Text style={{ fontWeight: "500" }}>
                (
                {x === "All"
                  ? tasks.length
                  : tasks.filter((t) => t.status === x.toLowerCase()).length}
                )
              </Text>
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.dateFilterRow}>
        <Pressable
          onPress={() => setShowDateFilter(true)}
          style={[styles.dateFilterButton, { borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            📅 {dateFilter || "Filter by date"}
          </Text>
        </Pressable>
        {!!dateFilter && (
          <Pressable onPress={() => setDateFilter("")} style={styles.clearDateButton}>
            <Text style={styles.clearDateText}>Clear</Text>
          </Pressable>
        )}
      </View>
      {showDateFilter && (
        <DateTimePicker
          value={dateFilter ? new Date(`${dateFilter}T12:00:00`) : new Date()}
          mode="date"
          display="default"
          onValueChange={(_, date) => {
            if (date) setDateFilter(formatLocalDate(date));
            setShowDateFilter(false);
          }}
          onDismiss={() => setShowDateFilter(false)}
        />
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortWrap}
      >
        {[
          ["due_date", "Due date"],
          ["start_date", "Start date"],
          ["priority", "Priority"],
          ["title", "Title"],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setSortBy(key)}
            style={[
              styles.sortPill,
              {
                borderColor: sortBy === key ? theme.accent : theme.line,
                backgroundColor: sortBy === key ? theme.pale : theme.card,
              },
            ]}
          >
            <Text
              style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}
            >
              Sort: {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.taskList}>
        {shown.map((task) => (
          <TaskRow key={task.id} item={task} />
        ))}
        {!shown.length && (
          <Text style={[styles.empty, { color: theme.sub }]}>
            No matching tasks found.
          </Text>
        )}
      </View>
    </ScrollView>
  );
  const Bulk = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <Header title="Bulk Upload" />
      <Text style={[styles.lead, { color: theme.sub }]}>
        Import task records from a CSV file. Required fields are validated
        before saving.
      </Text>
      <Pressable
        onPress={importFile}
        style={[
          styles.upload,
          { backgroundColor: theme.card, borderColor: theme.accent },
        ]}
      >
        <Text style={{ fontSize: 32 }}>↑</Text>
        <Text style={[styles.uploadTitle, { color: theme.text }]}>
          Select CSV file
        </Text>
        <Text style={{ color: theme.sub }}>
          Choose a .csv file from your device
        </Text>
      </Pressable>
      {importInfo && (
        <View
          style={[
            styles.result,
            { backgroundColor: theme.card, borderColor: theme.line },
          ]}
        >
          <Text style={[styles.taskTitle, { color: theme.text }]}>
            {importInfo.name}
          </Text>
          <Text style={[styles.meta, { color: theme.sub }]}> 
            Read {importInfo.total} records · Imported {importInfo.imported} ·
            Skipped duplicates {importInfo.duplicates}
          </Text>
          {importInfo.corrected > 0 && (
            <Text style={[styles.meta, { color: theme.sub, marginTop: 6 }]}> 
              Auto-corrected {importInfo.corrected} record
              {importInfo.corrected === 1 ? "" : "s"}
            </Text>
          )}
          {importInfo.errors.map((e, i) => (
            <Text key={i} style={styles.error}>
              • {e}
            </Text>
          ))}
          {importInfo.imported > 0 ? (
            <Text style={styles.success}>✓ Import finished successfully</Text>
          ) : (
            <Text style={styles.error}>No new valid records were imported.</Text>
          )}
        </View>
      )}
      <View style={[styles.tip, { backgroundColor: theme.pale }]}>
        <Text style={[styles.calloutTitle, { color: theme.text }]}>
          CSV format
        </Text>
        <Text style={{ color: theme.sub }}>
          id, title, description, category, priority, start_date, due_date,
          status
        </Text>
        <Text style={{ color: theme.sub, marginTop: 6 }}>
          Dates must be YYYY-MM-DD. Status: pending/completed.
        </Text>
      </View>
    </ScrollView>
  );
  const Settings = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <Header title="Settings" />
      <View
        style={[
          styles.setting,
          { backgroundColor: theme.card, borderColor: theme.line },
        ]}
      >
        <View>
          <Text style={[styles.taskTitle, { color: theme.text }]}>
            Dark mode
          </Text>
          <Text style={[styles.meta, { color: theme.sub }]}>
            Use a darker appearance
          </Text>
        </View>
        <Switch
          value={dark}
          onValueChange={setDark}
          trackColor={{ true: theme.accent }}
        />
      </View>
      <Pressable
        onPress={exportTasks}
        style={[styles.exportButton, { backgroundColor: theme.card, borderColor: theme.accent }]}
      >
        <Text style={{ color: theme.text, fontWeight: "700" }}>Export tasks to CSV</Text>
        <Text style={[styles.meta, { color: theme.sub }]}>Create a CSV from all saved tasks</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          Alert.alert("Clear all tasks?", "All saved tasks will be removed.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Clear all",
              style: "destructive",
              onPress: () => setTasks([]),
            },
          ])
        }
        style={[styles.danger, { borderColor: "#ef4444" }]}
      >
        <Text style={{ color: "#ef4444", fontWeight: "700" }}>
          Clear all tasks
        </Text>
      </Pressable>
      <Text
        style={[
          styles.meta,
          { color: theme.sub, textAlign: "center", marginTop: 16 },
        ]}
      >
        TaskFlow · Your tasks stay on this device
      </Text>
    </ScrollView>
  );
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      {!ready ? (
        <View style={styles.loading}>
          <Text style={{ color: theme.text }}>Loading TaskFlow…</Text>
        </View>
      ) : tab === "Home" ? (
        Home()
      ) : tab === "Tasks" ? (
        List()
      ) : tab === "Bulk" ? (
        Bulk()
      ) : (
        Settings()
      )}
      <View
        style={[
          styles.nav,
          { backgroundColor: theme.card, borderColor: theme.line },
        ]}
      >
        {[
          ["Home", "⌂"],
          ["Tasks", "☰"],
          ["Bulk", "⇧"],
          ["Settings", "⚙"],
        ].map(([x, i]) => (
          <Pressable key={x} onPress={() => setTab(x)} style={styles.navItem}>
            <Text
              style={{
                fontSize: 20,
                color: tab === x ? theme.accent : theme.sub,
              }}
            >
              {i}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: tab === x ? theme.accent : theme.sub,
              }}
            >
              {x}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={add}
        style={[styles.fab, { backgroundColor: theme.accent }]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <Modal visible={!!form} animationType="slide">
        <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
          <View style={styles.modalHead}>
            <Pressable onPress={() => setForm(null)}>
              <Text style={{ color: theme.sub, fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <Text style={[styles.taskTitle, { color: theme.text }]}>
              {form?.id ? "Edit task" : "New task"}
            </Text>
            <Pressable onPress={save}>
              <Text
                style={{ color: theme.accent, fontWeight: "800", fontSize: 16 }}
              >
                Save
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <FormField
              label="TITLE *"
              value={form?.title || ""}
              field="title"
              onChange={updateForm}
              theme={theme}
            />
            <FormField
              label="DESCRIPTION"
              value={form?.description || ""}
              field="description"
              onChange={updateForm}
              theme={theme}
              multiline
            />
            <FormField
              label="CATEGORY"
              value={form?.category || ""}
              field="category"
              onChange={updateForm}
              theme={theme}
            />
            <FormChoice
              label="PRIORITY"
              values={["Low", "Medium", "High"]}
              field="priority"
              value={form?.priority}
              onChange={updateForm}
              theme={theme}
            />
            <FormDateField
              label="START DATE"
              value={form?.start_date || ""}
              field="start_date"
              onChange={updateForm}
              theme={theme}
            />
            <FormDateField
              label="DUE DATE"
              value={form?.due_date || ""}
              field="due_date"
              onChange={updateForm}
              theme={theme}
              minimumDate={
                /^\d{4}-\d{2}-\d{2}$/.test(form?.start_date || "")
                  ? new Date(`${form.start_date}T12:00:00`)
                  : undefined
              }
            />
            <FormChoice
              label="STATUS"
              values={["pending", "completed"]}
              field="status"
              value={form?.status}
              onChange={updateForm}
              theme={theme}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={!!detail} animationType="slide">
        <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
          {detail && (
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.modalHead}>
                <Pressable onPress={() => setDetail(null)}>
                  <Text style={{ color: theme.sub, fontSize: 16 }}>‹ Back</Text>
                </Pressable>
                <Pressable onPress={() => remove(detail.id)}>
                  <Text style={{ color: "#ef4444", fontWeight: "700" }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.detailTitle, { color: theme.text }]}>
                {detail.title}
              </Text>
              <View style={styles.choices}>
                <View style={[styles.badge, { backgroundColor: theme.pale }]}>
                  <Text style={{ color: theme.text }}>{detail.priority}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.pale }]}>
                  <Text style={{ color: theme.text }}>{detail.category}</Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        detail.status === "completed" ? "#dcfce7" : theme.pale,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        detail.status === "completed" ? "#15803d" : theme.text,
                    }}
                  >
                    {detail.status}
                  </Text>
                </View>
              </View>
              <Text style={[styles.description, { color: theme.sub }]}>
                {detail.description || "No description provided."}
              </Text>
              <View
                style={[
                  styles.result,
                  { backgroundColor: theme.card, borderColor: theme.line },
                ]}
              >
                <Text style={[styles.meta, { color: theme.sub }]}>
                  START DATE
                </Text>
                <Text style={[styles.taskTitle, { color: theme.text }]}>
                  {detail.start_date}
                </Text>
                <Text
                  style={[styles.meta, { color: theme.sub, marginTop: 16 }]}
                >
                  DUE DATE
                </Text>
                <Text style={[styles.taskTitle, { color: theme.text }]}>
                  {detail.due_date}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  toggle(detail.id);
                  setDetail({
                    ...detail,
                    status:
                      detail.status === "completed" ? "pending" : "completed",
                  });
                }}
                style={[styles.primary, { backgroundColor: theme.accent }]}
              >
                <Text style={{ color: "#1a1a1a", fontWeight: "800" }}>
                  {detail.status === "completed"
                    ? "Mark as pending"
                    : "Mark as completed"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setForm(detail)}
                style={[styles.outline, { borderColor: theme.accent }]}
              >
                <Text style={{ color: theme.text, fontWeight: "800" }}>
                  Edit task
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { paddingHorizontal: 20, paddingTop: 8 },
  listContent: { paddingBottom: 110 },
  content: { padding: 20, paddingBottom: 110 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  heading: { fontSize: 28, fontWeight: "800" },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { width: "47.8%", padding: 16, borderWidth: 1, borderRadius: 16 },
  statNum: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  meta: { fontSize: 13, lineHeight: 19 },
  callout: { padding: 18, borderRadius: 16, marginTop: 22 },
  calloutTitle: { fontWeight: "800", fontSize: 16, marginBottom: 7 },
  outline: {
    borderWidth: 1,
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },
  section: { fontWeight: "800", fontSize: 19, marginTop: 26, marginBottom: 10 },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 78,
  },
  check: {
    height: 24,
    width: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: { fontWeight: "900", color: "#1a1a1a" },
  taskBody: { flex: 1, minWidth: 0 },
  taskTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  taskTitle: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  priority: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  priorityText: { fontSize: 11, fontWeight: "800" },
  overdue: { backgroundColor: "#fee2e2", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  overdueText: { color: "#b91c1c", fontSize: 10, fontWeight: "800" },
  swipeRow: { position: "relative", overflow: "hidden", marginBottom: 10 },
  swipeDelete: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 10,
    width: 96,
    borderRadius: 14,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeDeleteText: { color: "#fff", fontWeight: "800" },
  deleteButton: {
    height: 32,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  delete: { color: "#ef4444", fontSize: 25, fontWeight: "400" },
  empty: { textAlign: "center", marginTop: 36 },
  nav: {
    height: 66,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingRight: 62,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 62,
    gap: 1,
  },
  fab: {
    position: "absolute",
    right: 21,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { fontSize: 32, fontWeight: "300" },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  filterWrap: { flexDirection: "row", gap: 8, marginBottom: 10 },
  dateFilterRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  dateFilterButton: { flex: 1, height: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: "center" },
  clearDateButton: { paddingHorizontal: 6, paddingVertical: 10 },
  clearDateText: { color: "#dc2626", fontWeight: "700" },
  pill: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sortWrap: { gap: 8, paddingBottom: 12 },
  sortPill: {
    height: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  taskList: { paddingTop: 0 },
  upload: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 18,
    alignItems: "center",
    padding: 34,
    marginTop: 10,
  },
  uploadTitle: { fontSize: 17, fontWeight: "800", marginTop: 8 },
  result: { marginTop: 20, padding: 16, borderRadius: 15, borderWidth: 1 },
  error: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  success: { color: "#16a34a", fontWeight: "700", marginTop: 10 },
  tip: { padding: 17, borderRadius: 15, marginTop: 18 },
  setting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 15,
  },
  exportButton: { borderWidth: 1, padding: 16, borderRadius: 14, marginTop: 15, gap: 4 },
  danger: {
    borderWidth: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 12,
  },
  field: { marginBottom: 18 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 16,
  },
  dateInputRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dateInput: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 16,
  },
  calendarButton: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarIcon: { fontSize: 20 },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choice: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 11,
  },
  detailTitle: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: "800",
    marginBottom: 16,
  },
  badge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  description: { fontSize: 16, lineHeight: 24, marginTop: 22 },
  primary: {
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
});
