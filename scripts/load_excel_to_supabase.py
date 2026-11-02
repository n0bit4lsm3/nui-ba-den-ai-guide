from __future__ import annotations

import argparse
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


DATA_TABLES = [
    "destinations",
    "media_assets",
    "services_pricing",
    "operation_hours",
    "activities",
    "faq",
    "seo_keywords",
    "knowledge_base",
    "itineraries",
    "tags",
    "maps_navigation",
    "travel_tips",
    "weather_info",
    "transportation",
    "photo_spots",
    "food_stay",
    "contact_info",
    "events_culture",
    "safety_emergency",
    "chatbot_intents",
    "pricing_archive",
    "changelog",
]


def clean(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value).strip()


def identifier(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-z0-9_]+", "_", clean(value).lower()).strip("_")
    if not text:
        text = fallback
    if text[0].isdigit():
        text = f"data_{text}"
    return text


def normalize_dsn(dsn: str) -> str:
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    return dsn.replace("ssl=require", "sslmode=require")


def read_excel(path: Path) -> dict[str, tuple[list[str], list[list[str]]]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    result: dict[str, tuple[list[str], list[list[str]]]] = {}
    for worksheet in workbook.worksheets[2:]:
        table = identifier(worksheet.title, "sheet")
        if table not in DATA_TABLES:
            continue

        rows = worksheet.iter_rows(values_only=True)
        header_row = next(rows, None)
        if not header_row:
            continue

        headers: list[str] = []
        column_indexes: list[int] = []
        seen: dict[str, int] = {}
        for index, header in enumerate(header_row, start=1):
            if not clean(header):
                continue
            name = identifier(clean(header), f"column_{index}")
            seen[name] = seen.get(name, 0) + 1
            if seen[name] > 1:
                name = f"{name}_{seen[name]}"
            headers.append(name)
            column_indexes.append(index - 1)

        if not headers:
            continue

        values: list[list[str]] = []
        for row in rows:
            record = [
                clean(row[index] if index < len(row) else "")
                for index in column_indexes
            ]
            if any(record):
                values.append(record)
        result[table] = (headers, values)
    return result


def prepare_table(cursor, table: str, headers: list[str]) -> None:
    from psycopg2 import sql

    cursor.execute(
        sql.SQL("create table if not exists public.{} ({})").format(
            sql.Identifier(table),
            sql.SQL(", ").join(sql.SQL("{} text").format(sql.Identifier(header)) for header in headers),
        )
    )
    for header in headers:
        cursor.execute(
            sql.SQL("alter table public.{} add column if not exists {} text").format(
                sql.Identifier(table), sql.Identifier(header)
            )
        )


def insert_rows(cursor, table: str, headers: list[str], rows: list[list[str]]) -> None:
    if not rows:
        return

    from psycopg2 import sql

    query = sql.SQL("insert into public.{} ({}) values ({})").format(
        sql.Identifier(table),
        sql.SQL(", ").join(sql.Identifier(header) for header in headers),
        sql.SQL(", ").join(sql.Placeholder() for _ in headers),
    )
    cursor.executemany(query, rows)


def sync_rows(cursor, table: str, headers: list[str], rows: list[list[str]]) -> tuple[int, int]:
    from psycopg2 import sql

    cursor.execute(
        sql.SQL("select {} from public.{}").format(
            sql.SQL(", ").join(sql.Identifier(header) for header in headers),
            sql.Identifier(table),
        )
    )
    existing = [[clean(value) for value in row] for row in cursor.fetchall()]
    key = headers[0]
    source_keys = [row[0] for row in rows]
    existing_keys = [row[0] for row in existing]
    updated = 0
    added: list[list[str]] = []

    if (
        key.endswith("_id")
        and all(source_keys)
        and len(source_keys) == len(set(source_keys))
        and len(existing_keys) == len(set(existing_keys))
    ):
        by_key = {row[0]: row for row in existing}
        for row in rows:
            previous = by_key.get(row[0])
            if previous is None:
                added.append(row)
                continue
            changes = [(header, value) for header, value, old in zip(headers, row, previous) if value != old]
            if not changes:
                continue
            cursor.execute(
                sql.SQL("update public.{} set {} where {} = %s").format(
                    sql.Identifier(table),
                    sql.SQL(", ").join(
                        sql.SQL("{} = %s").format(sql.Identifier(header)) for header, _ in changes
                    ),
                    sql.Identifier(key),
                ),
                [value for _, value in changes] + [row[0]],
            )
            updated += 1
    else:
        remaining = Counter(tuple(row) for row in existing)
        for row in rows:
            item = tuple(row)
            if remaining[item]:
                remaining[item] -= 1
            else:
                added.append(row)

    insert_rows(cursor, table, headers, added)
    return updated, len(added)


def load_to_supabase(database_url: str, excel_path: Path) -> None:
    import psycopg2

    sheets = read_excel(excel_path)
    if not sheets:
        raise SystemExit("No supported sheets found in Excel.")

    with psycopg2.connect(normalize_dsn(database_url)) as conn:
        with conn.cursor() as cursor:
            for table, (headers, rows) in sheets.items():
                prepare_table(cursor, table, headers)
                updated, added = sync_rows(cursor, table, headers, rows)
                print(f"{table}: {updated} updated, {added} inserted")
        conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load local Excel data into Supabase data tables.")
    parser.add_argument("--excel", default="nui_ba_den_tourism_database.xlsx")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--yes", action="store_true", help="Confirm syncing Excel rows.")
    args = parser.parse_args()

    if not args.yes:
        raise SystemExit("Add --yes to sync Supabase data tables.")
    if not args.database_url:
        raise SystemExit("DATABASE_URL is required.")

    excel_path = Path(args.excel)
    if not excel_path.exists():
        raise SystemExit(f"Excel file not found: {excel_path}")

    load_to_supabase(args.database_url, excel_path)


if __name__ == "__main__":
    main()
