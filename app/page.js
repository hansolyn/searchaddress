// app/page.js
"use client";

import { useState } from "react";

const CONFIDENCE_LABEL = {
  official: { text: "공식 확인", color: "#16a34a", bg: "#dcfce7" },
  low_confidence: { text: "참고용 추정치", color: "#a16207", bg: "#fef9c3" },
  unknown: { text: "확인 불가", color: "#525252", bg: "#e5e5e5" },
};

export default function Home() {
  const [address, setAddress] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // app/page.js 내부의 handleSubmit 함수만 아래처럼 보완할 수 있습니다.
async function handleSubmit(e) {
  e.preventDefault();
  setLoading(true);
  setError(null);
  setResult(null);

  const requestBody = { address, year: Number(year) };
  if (month) requestBody.month = Number(month);

  async function fetchAddress() {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!res.ok) {
      const data = await res.json();
      const err = new Error(data.error || "서버 오류");
      err.status = res.status; // 상태 코드를 같이 들고 다니게 함
      throw err;
    }
    return res.json();
  }

  try {
    const data = await fetchAddress();
    setResult(data);
  } catch (firstErr) {
    // 429(요청 한도 초과)나 400(입력값 오류)은 재시도해도 똑같이 실패하므로 재시도 안 함
    if (firstErr.status === 429) {
      setError("지금 요청이 많아서 잠시 막혔어요. 1분 정도 후 다시 시도해주세요.");
      setLoading(false);
      return;
    }
    if (firstErr.status === 400) {
      setError(firstErr.message);
      setLoading(false);
      return;
    }

    console.log("첫 번째 시도 실패, 잠시 후 재시도합니다.", firstErr);
    await new Promise((r) => setTimeout(r, 1500)); // 재시도 전 1.5초 대기

    try {
      const data = await fetchAddress();
      setResult(data);
    } catch (secondErr) {
      setError(secondErr.message || "알 수 없는 오류가 발생했습니다.");
    }
  } finally {
    setLoading(false);
  }
}

  const confidenceInfo = result?.confidence
    ? CONFIDENCE_LABEL[result.confidence] || CONFIDENCE_LABEL.unknown
    : null;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        옛 주소를 찾아서...
      </h1>
      <p style={{ color: "#666", marginBottom: 32, fontSize: 14 }}>
        현재 기준 주소와 원하는 시기(연/월)를 입력하면, 그 당시의 주소를 알려드립니다.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4, color: "#333" }}>
            현재 주소
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 경상북도 영덕군 영덕읍 노물리 ..."
            required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, fontSize: 14 }}
          />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4, color: "#333" }}>
              연도
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="예: 1998"
              required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, fontSize: 14 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4, color: "#333" }}>
              월 (선택사항)
            </label>
            <input
              type="number"
              min="1"
              max="12"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="예: 6"
              required={false} // 👈 이렇게 명시적으로 false를 적어줍니다!
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, fontSize: 14 }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 16px",
            background: loading ? "#999" : "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "조사 중..." : "찾아줘!"}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: 24, padding: 16, background: "#fee2e2", borderRadius: 8, color: "#991b1b", fontSize: 14 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24, padding: 20, border: "1px solid #e5e5e5", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 999,
                color: confidenceInfo.color,
                background: confidenceInfo.bg,
              }}
            >
              {confidenceInfo.text}
            </span>
          </div>

          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {result.resolved_address || "해당 시점의 주소를 확인할 수 없습니다."}
          </p>

          {result.note && (
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{result.note}</p>
          )}

          {result.sources && result.sources.length > 0 && (
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#666" }}>출처: </span>
              {result.sources.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", marginRight: 8 }}>
                  [{i + 1}]
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
