use crate::config::AppPaths;

const IMG_REF_PREFIX: &str = r"!\[([^\]]*)\]\(\.\./uploads/images/([^)]+)\)";
const IMG_LINE_PREFIX: &str = "![图片](../uploads/images/";

pub fn read_note_file(paths: &AppPaths, title: &str) -> String {
    let md_path = paths.notes_folder.join(format!("{}.md", title));
    if !md_path.exists() {
        return String::new();
    }
    let raw = match std::fs::read_to_string(&md_path) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };
    // Remove first line (header) and image references
    let body = if let Some(idx) = raw.find('\n') {
        raw[idx + 1..].to_string()
    } else {
        String::new()
    };
    strip_img_refs(&body)
}

pub fn read_note_imgs(paths: &AppPaths, title: &str) -> Vec<String> {
    let md_path = paths.notes_folder.join(format!("{}.md", title));
    if !md_path.exists() {
        return vec![];
    }
    let raw = match std::fs::read_to_string(&md_path) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let re = regex_lite::Regex::new(IMG_REF_PREFIX).unwrap();
    re.captures_iter(&raw)
        .filter_map(|cap| cap.get(2).map(|m| m.as_str().to_string()))
        .collect()
}

pub fn save_note_file(paths: &AppPaths, title: &str, subject: &str, content: &str, imgs: &[String]) -> Result<(), String> {
    let header = format!("# {}/{}", subject, title);
    let mut parts = vec![];
    if !content.is_empty() {
        parts.push(content.to_string());
    }
    for img in imgs {
        parts.push(format!("{}{})", IMG_LINE_PREFIX, img));
    }
    let file_content = if parts.is_empty() {
        header
    } else {
        format!("{}\n{}", header, parts.join("\n"))
    };
    let md_path = paths.notes_folder.join(format!("{}.md", title));
    std::fs::write(&md_path, &file_content).map_err(|e| format!("保存笔记文件失败: {}", e))
}

pub fn strip_md_content(content: &str) -> String {
    let re = regex_lite::Regex::new(IMG_REF_PREFIX).unwrap();
    re.replace_all(content, "").to_string()
}

fn strip_img_refs(text: &str) -> String {
    let re = regex_lite::Regex::new(IMG_REF_PREFIX).unwrap();
    re.replace_all(text, "").to_string()
}

pub fn unique_filepath(dir: &std::path::Path, filename: &str) -> std::path::PathBuf {
    let path = dir.join(filename);
    if !path.exists() {
        return path;
    }
    let stem = std::path::Path::new(filename).file_stem()
        .and_then(|s| s.to_str()).unwrap_or("file");
    let ext = std::path::Path::new(filename).extension()
        .and_then(|e| e.to_str()).unwrap_or("");
    let mut counter = 1;
    loop {
        let ts = chrono::Utc::now().timestamp_millis();
        let new_name = format!("{}_{}_{}.{}", stem, counter, ts, ext);
        let new_path = dir.join(&new_name);
        if !new_path.exists() {
            return new_path;
        }
        counter += 1;
    }
}
