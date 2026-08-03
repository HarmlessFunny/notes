use crate::config::AppPaths;
use crate::models::Note;

pub fn build_export_zip(notes: &[Note], paths: &AppPaths, lang: &str) -> Result<Vec<u8>, String> {
    let mut buf = std::io::Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(&mut buf);
    let options = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let db_notes: Vec<serde_json::Value> = notes.iter().map(|n| serde_json::json!({
        "title": n.title,
        "subject": n.subject,
        "time": n.time,
    })).collect();
    let db_content = serde_json::to_string_pretty(&serde_json::json!({
        "notes": db_notes,
    })).map_err(|e| format!("{}: {}", crate::i18n::text(lang, "序列化失败", "Serialization failed"), e))?;

    zip.start_file("database.json", options)
        .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP写入失败", "ZIP write failed"), e))?;
    std::io::Write::write_all(&mut zip, db_content.as_bytes())
        .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP写入失败", "ZIP write failed"), e))?;

    for note in notes {
        let mut lines = vec![format!("# {}/{}", note.subject, note.title)];
        if !note.content.is_empty() {
            lines.push(note.content.clone());
        }
        for img in &note.imgs {
            lines.push(format!("![图片](../uploads/images/{})", img));
        }
        let md_content = lines.join("\n");
        let entry_name = format!("notes/{}.md", note.title);
        zip.start_file(&entry_name, options)
            .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP写入失败", "ZIP write failed"), e))?;
        std::io::Write::write_all(&mut zip, md_content.as_bytes())
            .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP写入失败", "ZIP write failed"), e))?;

        for img in &note.imgs {
            let img_path = paths.uploads_folder.join(img);
            if img_path.exists() {
                let data = std::fs::read(&img_path)
                    .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "读取图片失败", "Failed to read image"), e))?;
                let img_entry = format!("uploads/images/{}", img);
                zip.start_file(&img_entry, options)
                    .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP写入失败", "ZIP write failed"), e))?;
                std::io::Write::write_all(&mut zip, &data)
                    .map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP写入失败", "ZIP write failed"), e))?;
            }
        }
    }

    zip.finish().map_err(|e| format!("{}: {}", crate::i18n::text(lang, "ZIP完成失败", "ZIP finalize failed"), e))?;
    Ok(buf.into_inner())
}
