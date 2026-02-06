import sqlite3
import json

conn = sqlite3.connect('todos.db')
cursor = conn.cursor()

# Get column info
cursor.execute('PRAGMA table_info(todos)')
columns = [row[1] for row in cursor.fetchall()]

# Get all data
cursor.execute('SELECT * FROM todos')
rows = cursor.fetchall()

# Format as readable output
result = {
    "table": "todos",
    "columns": columns,
    "row_count": len(rows),
    "data": []
}

for row in rows:
    item = {}
    for i, col in enumerate(columns):
        item[col] = row[i]
    result["data"].append(item)

with open('todos_data.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print("Data saved to todos_data.json")
conn.close()
