import json
import re
import os
from datetime import datetime

TOP_IDS = [521310, 788115, 628061, 242573, 236340, 486223, 238548, 564887, 439534, 582668]
TOP_IDS_SET = set(TOP_IDS)

print("Loading data files...")
with open("data/persol-profile-index.json") as f:
    idx = json.load(f)
with open("data/persol-report-data.json") as f:
    report = json.load(f)

profiles_by_id = {p["id"]: p for p in idx["profiles"]}
records_by_id  = {r["id"]: r for r in report["records"]}

print("Reading candidate_deep.jsonl raw data...")
# We already extracted raw deep records to /tmp/top10_raw_deep.json
with open("/tmp/top10_raw_deep.json", encoding="utf-8") as f:
    deep_data = json.load(f)
# Keys in deep_data are strings because json keys are strings. Convert to int.
deep_data = {int(k): v for k, v in deep_data.items()}
print(f"Got {len(deep_data)} records.")

# ─── Helpers ────────────────────────────────────────────────────────────────

def safe_str(v):
    if v is None: return ""
    if isinstance(v, (int,float,bool)): return str(v)
    if isinstance(v, dict):
        return v.get("__name__","") or v.get("name","") or v.get("code","") or v.get("value","") or ""
    return str(v)

def parse_dt(s):
    if not s:
        return datetime.min
    s = str(s).strip()
    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"]:
        try: return datetime.strptime(s, fmt)
        except: pass
    # Fallback to sliced formats
    for fmt, length in [("%Y-%m-%d %H:%M:%S", 19), ("%Y-%m-%d %H:%M", 16), ("%Y-%m-%d", 10)]:
        try: return datetime.strptime(s[:length], fmt)
        except: pass
    return datetime.min

def extract_notes(raw_notes):
    """Parse structured note objects from candidate_deep.jsonl"""
    out = []
    if not isinstance(raw_notes, list):
        return out
    for n in raw_notes:
        if not isinstance(n, dict):
            continue
        result = n.get("result")
        if not isinstance(result, dict):
            continue
        notes_list = result.get("note")
        if not isinstance(notes_list, list):
            continue
        for note in notes_list:
            if not isinstance(note, dict):
                continue
            note_id = note.get("id")
            category = note.get("category")
            date_added = note.get("dateAdded")
            content = note.get("content") or ""
            
            # format all_content
            all_content = note.get("all_content", [])
            parts = []
            if isinstance(all_content, list):
                for item in all_content:
                    if isinstance(item, dict):
                        lbl = item.get("label") or ""
                        val = item.get("value") or ""
                        if lbl and val:
                            parts.append(f"{lbl}: {val}")
                        elif val:
                            parts.append(val)
                        elif lbl:
                            parts.append(lbl)
            
            structured_text = " | ".join(parts)
            full_content = structured_text if structured_text else content
            
            out.append({
                "id": note_id,
                "category": category,
                "dateAdded": date_added,
                "content": full_content,
                "raw_category": note.get("__name__")
            })
    out.sort(key=lambda x: x.get("dateAdded") or "", reverse=True)
    return out

def get_client_name(jo):
    if not isinstance(jo, dict):
        return ""
    client = jo.get("client")
    if isinstance(client, dict):
        return client.get("__name__") or client.get("name") or ""
    return ""

def parse_job_subs(subs):
    """Parse job submissions securely"""
    out = []
    if not isinstance(subs, dict):
        return out
    lst = subs.get("list")
    if not isinstance(lst, list):
        return out
    for item in lst:
        if not isinstance(item, dict):
            continue
        jo = item.get("joborder")
        # client extraction is now super safe
        client_name = get_client_name(jo)
        
        job_title = ""
        if isinstance(jo, dict):
            job_title = jo.get("__name__") or jo.get("jobTitle") or jo.get("title") or ""
            if not client_name:
                client_name = get_client_name(jo.get("client"))
        
        # Let's fallback if jobTitle or clientName is empty
        if not job_title:
            pos = item.get("position")
            if isinstance(pos, dict):
                job_title = pos.get("__name__") or pos.get("title") or ""
                
        status_val = item.get("mark") or item.get("status")
        status_str = safe_str(status_val)
        
        out.append({
            "id": item.get("id"),
            "jobTitle": job_title,
            "clientName": client_name,
            "status": status_str,
            "dateAdded": safe_str(item.get("dateAdded")),
            "lastUpdateDate": safe_str(item.get("lastUpdateDate"))
        })
    return out

# ─── Salary Normalization ───────────────────────────────────────────────────

def normalize_salary(val):
    if val is None:
        return None
    try:
        val = float(val)
    except (ValueError, TypeError):
        return None
    if val <= 0:
        return None
    # monthly salary (e.g. 10000) -> annual (120000)
    if val < 50000:
        return val * 12
    # suspicious large numbers (e.g., > 10,000,000) -> probably divided by 100 (cents/fen) or input error
    if val > 10000000:
        val_divided = val / 100.0
        if val_divided > 5000000:
            return None
        return val_divided
    return val

# ─── Junk Company Patterns ──────────────────────────────────────────────────

JUNK_COMPANY_PATTERNS = [
    re.compile(r"^公司（请不要修改）$"),
    re.compile(r"^未知公司"),
    re.compile(r"^未知\s*\d+$"),
    re.compile(r"^-\s*\d+$"),
    re.compile(r"^公司$"),
    re.compile(r"^无$"),
]

def is_junk_company(name):
    if not name:
        return True
    return any(p.match(name) for p in JUNK_COMPANY_PATTERNS)

governed = []

for cid in TOP_IDS:
    rec = deep_data.get(cid, {})
    prof = profiles_by_id.get(cid, {})
    rep = records_by_id.get(cid, {})
    
    # 1. Base Info
    name = rep.get("chineseName") or rep.get("name") or prof.get("name") or ""
    gender = rep.get("gender") or "未知"
    age = rep.get("age") or None
    
    # 2. Company / Title
    current_company = rep.get("companyName") or ""
    current_title = rep.get("title") or ""
    
    # 3. Location / City
    inferred_city = rep.get("cityCodes")
    if inferred_city and isinstance(inferred_city, list) and len(inferred_city) > 0:
        inferred_city = inferred_city[0]
    else:
        inferred_city = rep.get("locationCodes")
        if inferred_city and isinstance(inferred_city, list) and len(inferred_city) > 0:
            inferred_city = inferred_city[0]
        else:
            inferred_city = ""
    inferred_city = safe_str(inferred_city)
    
    # 4. Salaries
    sal_raw = rep.get("annualSalary")
    norm_salary = normalize_salary(sal_raw)
    exp_salary = rep.get("expectedSalary") or ""
    
    # 5. Attachments
    raw_files = rec.get("files", []) or []
    attachments_all = len(raw_files)
    
    seen_files = set()
    unique_files = []
    html_atts = []
    pdf_atts = []
    doc_atts = []
    
    for f in raw_files:
        if not isinstance(f, dict):
            continue
        fname = safe_str(f.get("originname") or f.get("__name__"))
        fext = safe_str(f.get("ext")).lower()
        fsize = f.get("filesize")
        tag = safe_str(f.get("tag"))
        
        key = (fname, fext, fsize, tag)
        if key in seen_files:
            continue
        seen_files.add(key)
        unique_files.append({
            "id": f.get("id"),
            "name": fname,
            "category": tag,
            "ext": fext,
            "filesize": fsize,
            "dateAdded": safe_str(f.get("dateAdded"))
        })
        
        if fext == "html" or tag == "HTML":
            html_atts.append(fname)
        elif fext == "pdf" or tag == "PDF":
            pdf_atts.append(fname)
        elif fext in ["doc", "docx"] or tag in ["Word", "DOC"]:
            doc_atts.append(fname)
            
    dup_removed = attachments_all - len(unique_files)
    
    # 6. Notes
    raw_notes = rec.get("notes", [])
    parsed_notes = extract_notes(raw_notes)
    notes_count = len(parsed_notes)
    
    note_categories = {}
    for n in parsed_notes:
        cat = n.get("category") or "Uncategorized"
        note_categories[cat] = note_categories.get(cat, 0) + 1
        
    notes_text_preview = ""
    if parsed_notes:
        notes_text_preview = parsed_notes[0].get("content") or ""
        
    # 7. Experiences and Educations
    exps = prof.get("experiences", [])
    edus = prof.get("educations", [])
    
    # 8. Job Submissions
    job_subs = parse_job_subs(rec.get("jobsubmissions"))
    total_subs = len(job_subs)
    
    # 9. Data Quality Issues Detection
    issues = []
    if is_junk_company(current_company):
        issues.append(f"垃圾公司名: {repr(current_company)}")
    if not current_title or current_title in ["未知", "unknown", "-", "NULL", "null"]:
        issues.append(f"无效或缺失职位: {repr(current_title)}")
    if norm_salary is None and sal_raw is not None and sal_raw != 0:
        issues.append(f"薪资数据异常/无法归一化: {repr(sal_raw)}")
    if sal_raw is not None and (isinstance(sal_raw, (int, float)) and (sal_raw < 0 or sal_raw > 10000000)):
        issues.append(f"薪资数据范围异常: {repr(sal_raw)}")
    if not rep.get("email") and not rep.get("mobile"):
        issues.append("没有任何联系方式")
    elif not rep.get("email"):
        issues.append("缺少邮箱")
    elif not rep.get("mobile"):
        issues.append("缺少电话")
        
    last_update = rep.get("lastUpdateDate") or rep.get("lastContactDate")
    if last_update:
        dt = parse_dt(last_update)
        if dt != datetime.min:
            days_since = (datetime.now() - dt).days
            if days_since > 1825:
                issues.append(f"超过5年未更新 (最后更新: {last_update})")
        else:
            issues.append(f"无法解析的更新日期: {repr(last_update)}")
    else:
        issues.append("缺失更新日期")
        
    if not current_title and not rep.get("functionPath"):
        issues.append("完全缺失职能信息 (no title & no functionPath)")
        
    gov = {
        "id": cid,
        "chineseName": name,
        "gender": gender,
        "age": age,
        "currentCompany": current_company,
        "currentTitle": current_title,
        "inferredCity": inferred_city,
        "annualSalary_raw": sal_raw,
        "annualSalary_normalized": norm_salary,
        "expectedSalary": exp_salary,
        "attachments_all": attachments_all,
        "attachments_unique": unique_files,
        "attachments_duplicates_removed": dup_removed,
        "html_attachments": html_atts,
        "pdf_attachments": pdf_atts,
        "doc_attachments": doc_atts,
        "notes_count": notes_count,
        "note_categories": note_categories,
        "notes_text_preview": notes_text_preview,
        "experiences": exps,
        "educations": edus,
        "jobSubmissions_total": total_subs,
        "source": rep.get("source") or "",
        "status": rep.get("status") or "",
        "dateAdded": rep.get("dateAdded") or "",
        "dataQuality": {
            "issues": issues,
            "issueCount": len(issues),
            "hasHtmlCV": bool(html_atts),
            "hasPdfCV": bool(pdf_atts),
            "hasDocCV": bool(doc_atts),
            "hasCareerHistory": bool(exps),
            "hasNotes": bool(parsed_notes),
            "hasSalaryData": norm_salary is not None,
            "hasCityData": bool(inferred_city),
            "duplicateAttachmentsRemoved": dup_removed > 0,
        }
    }
    governed.append(gov)

with open("/tmp/top10_governed.json", "w", encoding="utf-8") as f:
    json.dump(governed, f, ensure_ascii=False, indent=2)

print("=== GOVERNANCE SUMMARY ===\n")
for i, g in enumerate(governed):
    dq = g["dataQuality"]
    print(f"#{i+1} ID={g['id']} 【{g['chineseName']}】{g['gender']} {g['age']}岁")
    print(f"  公司: {g['currentCompany']}")
    print(f"  职位: {g['currentTitle'] or '(空)'}  城市: {g['inferredCity'] or '未知'}")
    print(f"  年薪: raw={g['annualSalary_raw']} → {g['annualSalary_normalized']}  期望: {g['expectedSalary']}")
    print(f"  附件: {g['attachments_all']} 条 → 去重后 {len(g['attachments_unique'])} 条 (-{g['attachments_duplicates_removed']})")
    print(f"  简历类型: HTML×{len(g['html_attachments'])}  PDF×{len(g['pdf_attachments'])}  DOC×{len(g['doc_attachments'])}")
    print(f"  备注: {g['notes_count']}条  类别: {dict(list(g['note_categories'].items())[:4])}")
    print(f"  工作经历: {len(g['experiences'])}  教育: {len(g['educations'])}  历史投递: {g['jobSubmissions_total']}")
    print(f"  来源: {g['source']}  状态: {g['status']}  入库: {g['dateAdded'][:10] if g['dateAdded'] else '未知'}")
    if g['notes_text_preview']:
        print(f"  最新备注: {g['notes_text_preview'][:180]}")
    for issue in dq["issues"]:
        print(f"  ⚠️  {issue}")
    print()

print("✅ Saved to /tmp/top10_governed.json")