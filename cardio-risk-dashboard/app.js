// =====================================================
// Cormeum — app.js
// Segmented controls · Risk prediction · Result panel
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    // Footer year
    const yearEl = document.getElementById("footer-year");
    if (yearEl) yearEl.textContent = `© ${new Date().getFullYear()} Cormeum. Educational tool — not medical advice.`;

    // Initialise all segmented controls
    document.querySelectorAll(".segmented").forEach(seg => {
        const hiddenId = seg.id.replace("seg-", "");
        const hiddenInput = document.getElementById(hiddenId);

        seg.querySelectorAll(".seg-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                seg.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                if (hiddenInput) hiddenInput.value = btn.dataset.value;
            });
        });
    });
});

// ----- Reset -----
function resetForm() {
    document.getElementById("metrics-form").reset();

    // Reset each segmented control to its first button
    document.querySelectorAll(".segmented").forEach(seg => {
        const btns = seg.querySelectorAll(".seg-btn");
        btns.forEach(b => b.classList.remove("active"));
        if (btns.length) btns[0].classList.add("active");

        const hiddenId = seg.id.replace("seg-", "");
        const hiddenInput = document.getElementById(hiddenId);
        if (hiddenInput && btns[0]) hiddenInput.value = btns[0].dataset.value;
    });

    // Restore specific defaults
    const genderSeg = document.getElementById("seg-gender");
    if (genderSeg) {
        const btns = genderSeg.querySelectorAll(".seg-btn");
        btns.forEach(b => b.classList.remove("active"));
        btns[1].classList.add("active"); // Male
        document.getElementById("gender").value = "male";
    }

    // Show empty state, hide results
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("result-view").classList.add("hidden");
}

// ----- Form Submit -----
function handleFormSubmit(event) {
    event.preventDefault();

    const overlay = document.getElementById("loading-overlay");
    overlay.classList.add("active");

    // Required inputs
    const age    = parseInt(document.getElementById("age").value);
    const gender = document.getElementById("gender").value;
    const height = parseFloat(document.getElementById("height").value);
    const weight = parseFloat(document.getElementById("weight").value);

    // Optional inputs (default to healthy averages)
    const sbpRaw = document.getElementById("ap-hi").value;
    const dbpRaw = document.getElementById("ap-low").value;
    const sbp = sbpRaw === "" ? 120 : parseInt(sbpRaw);
    const dbp = dbpRaw === "" ? 80  : parseInt(dbpRaw);

    const cholesterol = parseInt(document.getElementById("cholesterol").value) || 1;
    const glucose     = parseInt(document.getElementById("glucose").value)     || 1;
    const smoke       = document.getElementById("smoke").value === "true";

    setTimeout(() => {
        // 1. BMI
        const bmi = weight / Math.pow(height / 100, 2);
        let bmiClass = "Normal";
        if      (bmi < 18.5) bmiClass = "Underweight";
        else if (bmi < 25)   bmiClass = "Normal";
        else if (bmi < 30)   bmiClass = "Overweight";
        else                  bmiClass = "Obese";

        // 2. Blood Pressure
        let bpClass = "Normal";
        if      (sbp < 120 && dbp < 80)                           bpClass = "Normal";
        else if (sbp >= 120 && sbp < 130 && dbp < 80)             bpClass = "Elevated";
        else if ((sbp >= 130 && sbp < 140) || (dbp >= 80 && dbp < 90)) bpClass = "Stage 1 Hypertension";
        else if ((sbp >= 140 && sbp <= 180) || (dbp >= 90 && dbp <= 120)) bpClass = "Stage 2 Hypertension";
        else if (sbp > 180 || dbp > 120)                          bpClass = "Hypertensive Crisis";

        // 3. Logistic Risk Model
        let z = -3.8;
        z += age * 0.042;
        if (gender === "male") z += 0.38;
        if (bmi >= 25 && bmi < 30) z += 0.25;
        if (bmi >= 30) z += 0.6;
        if (bpClass === "Elevated")             z += 0.3;
        if (bpClass === "Stage 1 Hypertension") z += 0.75;
        if (bpClass === "Stage 2 Hypertension") z += 1.45;
        if (bpClass === "Hypertensive Crisis")  z += 2.3;
        const pp = sbp - dbp;
        if (pp > 50) z += (pp - 50) * 0.015;
        if (cholesterol === 2) z += 0.55;
        if (cholesterol === 3) z += 1.2;
        if (glucose === 2) z += 0.35;
        if (glucose === 3) z += 0.85;
        if (smoke) z += 0.8;

        let riskScore = Math.round((1 / (1 + Math.exp(-z))) * 100);
        riskScore = Math.max(2, Math.min(99, riskScore));

        // 4. Risk band
        let band = "low", bandColor = "var(--risk-low)", badgeLabel = "Low risk";
        if (riskScore >= 10 && riskScore < 25) {
            band = "mid";  bandColor = "var(--risk-mid)";  badgeLabel = "Moderate risk";
        } else if (riskScore >= 25) {
            band = "high"; bandColor = "var(--risk-high)"; badgeLabel = "Elevated risk";
        }

        // 5. Render result panel
        overlay.classList.remove("active");
        document.getElementById("empty-state").classList.add("hidden");
        document.getElementById("result-view").classList.remove("hidden");

        // Score number
        const scoreEl = document.getElementById("score-number");
        scoreEl.textContent = riskScore;
        scoreEl.style.color = bandColor;

        // Risk badge
        const badge = document.getElementById("risk-badge");
        badge.textContent = badgeLabel;
        badge.className = `risk-badge ${band}`;

        // Progress bar (defer for CSS transition)
        const fill = document.getElementById("score-bar-fill");
        fill.style.width = "0%";
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fill.style.width = riskScore + "%";
                fill.style.backgroundColor = bandColor;
            });
        });

        // BMI note
        document.getElementById("bmi-note").innerHTML =
            `BMI <strong>${bmi.toFixed(1)}</strong> (${bmiClass}). Score reflects the combined weight of the inputs below.`;

        // Contributing factors
        renderFactors({ age, gender, bmi, bpClass, sbp, dbp, cholesterol, glucose, smoke, bandColor });

        // Scroll to result on mobile
        if (window.innerWidth < 1024) {
            document.getElementById("result").scrollIntoView({ behavior: "smooth", block: "start" });
        }

    }, 800);
}

// ----- Contributing Factors -----
function renderFactors({ age, gender, bmi, bpClass, sbp, dbp, cholesterol, glucose, smoke, bandColor }) {
    const list = document.getElementById("factors-list");
    list.innerHTML = "";

    const factors = [];

    // Blood pressure
    const bpPctMap = {
        "Normal": 8, "Elevated": 28,
        "Stage 1 Hypertension": 52, "Stage 2 Hypertension": 82, "Hypertensive Crisis": 96
    };
    const bpPct = bpPctMap[bpClass] ?? 8;
    factors.push({
        name: "Blood pressure",
        pct: bpPct,
        risk: bpPct > 20,
        note: `${sbp}/${dbp} mmHg`
    });

    // Age
    const agePct = Math.round(Math.min(Math.max((age - 18) / 62 * 100, 5), 95));
    factors.push({ name: "Age", pct: agePct, risk: age >= 45, note: `${age} yrs` });

    // BMI
    const bmiPct = bmi >= 30 ? 70 : bmi >= 25 ? 38 : bmi < 18.5 ? 22 : 10;
    factors.push({ name: "BMI", pct: bmiPct, risk: bmi >= 25, note: bmi.toFixed(1) });

    // Cholesterol
    const cholPct = cholesterol === 3 ? 80 : cholesterol === 2 ? 44 : 9;
    const cholLabel = ["", "Normal", "Above normal", "Well above"][cholesterol] || "Normal";
    factors.push({ name: "Cholesterol", pct: cholPct, risk: cholesterol > 1, note: cholLabel });

    // Glucose
    const glucPct = glucose === 3 ? 64 : glucose === 2 ? 33 : 8;
    const glucLabel = ["", "Normal", "Above normal", "Well above"][glucose] || "Normal";
    factors.push({ name: "Glucose", pct: glucPct, risk: glucose > 1, note: glucLabel });

    // Smoking
    factors.push({
        name: "Smoking",
        pct: smoke ? 74 : 5,
        risk: smoke,
        note: smoke ? "Active smoker" : "Non-smoker"
    });

    // Sex
    factors.push({
        name: "Sex",
        pct: gender === "male" ? 38 : 18,
        risk: gender === "male",
        note: gender === "male" ? "Male" : "Female"
    });

    factors.forEach(f => {
        const barColor = f.risk ? bandColor : "var(--risk-low)";
        const li = document.createElement("li");
        li.className = "factor-item";
        li.innerHTML = `
            <span class="factor-name">${f.name}</span>
            <div class="factor-bar-track">
                <div class="factor-bar-fill" style="width: 0%; background-color: ${barColor};" data-pct="${f.pct}"></div>
            </div>
            <span class="factor-note">${f.note}</span>
        `;
        list.appendChild(li);
    });

    // Animate factor bars after append
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            list.querySelectorAll(".factor-bar-fill").forEach(bar => {
                bar.style.width = bar.dataset.pct + "%";
            });
        });
    });
}
