/**
 * CONFIGURACIÓN - Categorías personalizables
 */
const DEFAULT_CONFIG = {
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    gastosFijos: [
        'Arriendo', 'Mercado', 'Agua', 'Luz', 'Gas', 'Gimnasio', 'Teléfono',
        'Plataformas', 'Idioma y Coach', 'Peluquería', 'Crédito carro/seguro',
        'Gastos generales', 'Servicios aseo', 'Otros gastos'
    ],
    ahorros: [
        'Inversión', 'Viaje', 'Regalos', 'Dermatología', 'Estudio',
        'Declaración renta', 'SOAT/Tránsito', 'Antojitos', 'Ropa',
        'Salidas', 'Casa', 'Otros ahorros'
    ],
    variables: [
        '🍔 Alimentos/Calle', '🎬 Entretenimiento', '🚗 Transporte',
        '💊 Salud/Farmacia', '🛍️ Compras', '📦 Otros'
    ],
    storageKey: 'control_gastos_v4_optimized'
};

// Configuración dinámica
let CONFIG = { ...DEFAULT_CONFIG };

/**
 * STORE - Manejo de datos Centralizado (Single Source of Truth)
 */
const Store = {
    data: {
        initial: { money: 0, savings: {} },
        history: [],
        withdrawals: [],
        variableExpenses: [],
        currentMonth: { incomes: [{v:0,d:''},{v:0,d:''},{v:0,d:''}], gastos: {}, ahorros: {} },
        customCategories: { gastos: [], ahorros: [], variables: [] }
    },

    init() {
        const saved = localStorage.getItem(CONFIG.storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.data = { ...this.data, ...parsed };
                // Migración o inicialización de estructuras nuevas si es necesario
                if (!this.data.customCategories) {
                    this.data.customCategories = { gastos: [], ahorros: [], variables: [] };
                }
            } catch(e) { console.error('Error loading data:', e); }
        }
        this.loadCustomCategories();
    },

    loadCustomCategories() {
        CONFIG.gastosFijos = [...DEFAULT_CONFIG.gastosFijos, ...this.data.customCategories.gastos];
        CONFIG.ahorros = [...DEFAULT_CONFIG.ahorros, ...this.data.customCategories.ahorros];
        CONFIG.variables = [...DEFAULT_CONFIG.variables, ...this.data.customCategories.variables];
    },

    save() {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.data));
    },

    reset() {
        localStorage.removeItem(CONFIG.storageKey);
        location.reload();
    },

    // O(N) Calculation of Balances
    getBalances() {
        // Inicializar con copias para evitar mutación
        let balances = { ...this.data.initial.savings };
        let available = this.data.initial.money;

        // Single pass over history to aggregate savings and available funds
        for (const h of this.data.history) {
            available += h.available;
            if (h.savings) {
                for (const k in h.savings) {
                    balances[k] = (balances[k] || 0) + h.savings[k];
                }
            }
        }

        // Subtract withdrawals in single pass
        for (const w of this.data.withdrawals) {
            if (w.category === 'DISPONIBLE') available -= w.amount;
            else balances[w.category] = (balances[w.category] || 0) - w.amount;
        }

        // Subtract variable expenses in single pass
        for (const e of this.data.variableExpenses) {
            available -= e.amount;
        }

        return { balances, available };
    },

    // O(N) Statistics calculation
    getStats() {
        let totalIng = 0;
        let totalGas = 0;
        let totalAho = 0;
        const allExpenses = {}; // Map for O(1) access/aggregation

        // Single pass aggregation
        for (const h of this.data.history) {
            totalIng += h.totalIncome;
            totalGas += h.totalExpenses;
            totalAho += h.totalSavings;
            
            if (h.expenses) {
                for (const k in h.expenses) {
                    allExpenses[k] = (allExpenses[k] || 0) + h.expenses[k];
                }
            }
        }

        // Find max expense category
        let maxExpName = '-';
        let maxExpVal = 0;
        for (const [k, v] of Object.entries(allExpenses)) {
            if (v > maxExpVal) {
                maxExpVal = v;
                maxExpName = k;
            }
        }

        return {
            totalIng,
            totalGas,
            totalAho,
            maxExpName,
            allExpensesMap: allExpenses
        };
    },

    // Nueva funcionalidad: Merge Month (Suma valores en lugar de reemplazar)
    mergeMonth(monthYear, newMonthData) {
        const idx = this.data.history.findIndex(h => h.monthYear === monthYear);
        if (idx === -1) return false;

        const existing = this.data.history[idx];

        // 1. Fusionar Ingresos: Concatenar arrays
        const mergedIncomes = [...existing.incomes, ...newMonthData.incomes];
        const newTotalIncome = existing.totalIncome + newMonthData.totalIncome;

        // 2. Fusionar Gastos: Sumar valores por categoría
        const mergedExpenses = { ...existing.expenses };
        for (const [k, v] of Object.entries(newMonthData.expenses)) {
            mergedExpenses[k] = (mergedExpenses[k] || 0) + v;
        }
        const newTotalExpenses = existing.totalExpenses + newMonthData.totalExpenses;

        // 3. Fusionar Ahorros: Sumar valores por categoría
        const mergedSavings = { ...existing.savings };
        for (const [k, v] of Object.entries(newMonthData.savings)) {
            mergedSavings[k] = (mergedSavings[k] || 0) + v;
        }
        const newTotalSavings = existing.totalSavings + newMonthData.totalSavings;

        // 4. Recalcular Disponible
        const newAvailable = newTotalIncome - newTotalExpenses - newTotalSavings;

        // Actualizar registro
        this.data.history[idx] = {
            ...existing,
            incomes: mergedIncomes,
            totalIncome: newTotalIncome,
            expenses: mergedExpenses,
            totalExpenses: newTotalExpenses,
            savings: mergedSavings,
            totalSavings: newTotalSavings,
            available: newAvailable,
            lastUpdated: new Date().toISOString()
        };

        return true;
    }
};

/**
 * UI Helpers
 */
const UI = {
    $(id) { return document.getElementById(id); },
    val(id) { return this.$(id)?.value || ''; },
    setVal(id, v) { const el = this.$(id); if(el) el.value = v; },
    txt(id, t) { const el = this.$(id); if(el) el.innerText = t; },

    fmt(n) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', maximumFractionDigits: 0
        }).format(n || 0);
    },

    toast(msg, type = 'success') {
        const t = this.$('toast');
        if(!t) return;
        t.innerText = msg;
        t.className = `toast show ${type}`;
        setTimeout(() => t.className = 'toast', 3500);
    },

    renderInputGrid(containerId, items, dataObj, cssClass) {
        const container = this.$(containerId);
        if (!container) return;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment(); // Performance: Reflow optimization
        
        items.forEach(item => {
            const val = dataObj[item] || 0;
            const div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = `
                <label class="form-label">${item}</label>
                <input type="number" data-cat="${item}" class="form-control ${cssClass}" 
                       value="${val || ''}" placeholder="0" min="0">
            `;
            fragment.appendChild(div);
        });
        container.appendChild(fragment);
    }
};

/**
 * CHARTS - Gráficos con Chart.js
 */
const Charts = {
    instances: {},
    colors: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#a855f7'],

    destroy(id) {
        if (this.instances[id]) {
            this.instances[id].destroy();
            delete this.instances[id];
        }
    },

    renderPieGastos(allExpensesMap) {
        this.destroy('chart-gastos-pie');
        const ctx = UI.$('chart-gastos-pie');
        if (!ctx) return;

        const labels = Object.keys(allExpensesMap);
        const data = Object.values(allExpensesMap);

        if (labels.length === 0) return;

        this.instances['chart-gastos-pie'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: this.colors, borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }
            }
        });
    },

    renderEvolution(history) {
        this.destroy('chart-evolution');
        const ctx = UI.$('chart-evolution');
        if (!ctx || history.length === 0) return;

        // Map once for better performance
        const labels = [];
        const ingresos = [];
        const gastos = [];
        const ahorros = [];
        
        history.forEach(h => {
             labels.push(h.monthYear);
             ingresos.push(h.totalIncome);
             gastos.push(h.totalExpenses);
             ahorros.push(h.totalSavings);
        });

        this.instances['chart-evolution'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Ingresos', data: ingresos, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 },
                    { label: 'Gastos', data: gastos, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 },
                    { label: 'Ahorros', data: ahorros, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true, tension: 0.4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: { x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } } }
            }
        });
    },

    renderAhorrosBar(balances) {
        this.destroy('chart-ahorros-bar');
        const ctx = UI.$('chart-ahorros-bar');
        if (!ctx) return;

        const filtered = Object.entries(balances).filter(([k, v]) => v > 0);
        if (filtered.length === 0) return;

        this.instances['chart-ahorros-bar'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: filtered.map(([k]) => k),
                datasets: [{ label: 'Saldo', data: filtered.map(([, v]) => v), backgroundColor: this.colors, borderRadius: 8 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } } }
            }
        });
    },

    renderPrediction(history) {
        this.destroy('chart-prediction');
        const ctx = UI.$('chart-prediction');
        if (!ctx || history.length < 2) return;

        const labels = history.map(h => h.monthYear);
        const gastos = history.map(h => h.totalExpenses);

        const avg = gastos.reduce((a, b) => a + b, 0) / gastos.length;
        const trend = (gastos[gastos.length - 1] - gastos[0]) / gastos.length;

        const predictions = [1, 2, 3].map(i => Math.max(0, avg + trend * i));
        const predLabels = ['Mes +1', 'Mes +2', 'Mes +3'];

        this.instances['chart-prediction'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [...labels.slice(-3), ...predLabels],
                datasets: [
                    { label: 'Histórico', data: [...gastos.slice(-3), null, null, null], backgroundColor: '#3b82f6', borderRadius: 8 },
                    { label: 'Proyección', data: [null, null, null, ...predictions], backgroundColor: '#f59e0b', borderRadius: 8 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } } }
            }
        });
    },

    renderAll() {
        // Obtenemos los datos necesarios una vez
        const stats = Store.getStats();
        const { balances } = Store.getBalances();
        const history = Store.data.history;

        this.renderPieGastos(stats.allExpensesMap);
        this.renderEvolution(history);
        this.renderAhorrosBar(balances);
        this.renderPrediction(history);
    }
};

/**
 * APP - Lógica principal
 */
const App = {
    init() {
        Store.init();
        this.setupSelectors();
        this.setupIncomesGrid();
        this.renderMonthInputs();
        this.renderInitialInputs();
        this.setupListeners();
        this.setDefaultDates();
        this.populateVariableCategories();
        this.updateAll();
    },

    setupSelectors() {
        const monthSel = UI.$('month-select');
        const yearSel = UI.$('year-select');
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();

        monthSel.innerHTML = '';
        CONFIG.months.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = m;
            monthSel.appendChild(opt);
        });
        monthSel.value = currentMonth;

        yearSel.innerHTML = '';
        for (let y = currentYear - 2; y <= currentYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            yearSel.appendChild(opt);
        }
        yearSel.value = currentYear;
    },

    setupIncomesGrid() {
        const grid = UI.$('ingresos-grid');
        grid.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const inc = Store.data.currentMonth.incomes[i] || {v:0,d:''};
            const div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = `
                <label class="form-label">Ingreso ${i + 1}</label>
                <input type="number" id="ing-val-${i}" class="form-control input-ing" 
                       value="${inc.v || ''}" placeholder="Valor COP">
                <input type="text" id="ing-desc-${i}" class="form-control mt-1" 
                       value="${inc.d || ''}" placeholder="Descripción" style="margin-top:8px;font-size:0.85rem">
            `;
            grid.appendChild(div);
        }
    },

    renderMonthInputs() {
        UI.renderInputGrid('gastos-grid', CONFIG.gastosFijos, Store.data.currentMonth.gastos, 'input-gasto');
        UI.renderInputGrid('ahorros-grid', CONFIG.ahorros, Store.data.currentMonth.ahorros, 'input-ahorro');
    },

    renderInitialInputs() {
        UI.setVal('init-disponible', Store.data.initial.money || '');
        UI.renderInputGrid('init-ahorros-grid', CONFIG.ahorros, Store.data.initial.savings, 'input-init');
    },

    populateVariableCategories() {
        const sel = UI.$('gv-cat');
        if (!sel) return;
        sel.innerHTML = '';
        CONFIG.variables.forEach(cat => {
            sel.innerHTML += `<option>${cat}</option>`;
        });
    },

    setupListeners() {
        // Event delegation for better performance
        document.body.addEventListener('input', (e) => {
            if (e.target.matches('.input-ing') || e.target.matches('.input-gasto') || e.target.matches('.input-ahorro')) {
                this.calcMonthTotals();
            }
            if (e.target.matches('.input-init') || e.target.id === 'init-disponible') {
                this.calcInitTotals();
            }
        });
    },

    setDefaultDates() {
        const today = new Date().toISOString().split('T')[0];
        UI.setVal('gv-fecha', today);
        UI.setVal('ret-fecha', today);
    },

    // Get current form data helper
    getCurrentFormData() {
        // Collect Incomes
        let totalIng = 0;
        const incomes = [0,1,2].map(i => {
            const v = parseFloat(UI.val(`ing-val-${i}`)) || 0;
            totalIng += v;
            return v > 0 ? { value: v, description: UI.val(`ing-desc-${i}`), date: new Date().toISOString() } : null;
        }).filter(i => i !== null); // Only keep valid incomes

        // Collect Fixed Expenses
        let totalGas = 0;
        const gastos = {};
        document.querySelectorAll('.input-gasto').forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            if (v > 0) { 
                gastos[inp.dataset.cat] = v; 
                totalGas += v; 
            }
        });

        // Collect Savings
        let totalAho = 0;
        const ahorros = {};
        document.querySelectorAll('.input-ahorro').forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            if (v > 0) { 
                ahorros[inp.dataset.cat] = v; 
                totalAho += v; 
            }
        });

        return {
            incomes,
            totalIncome: totalIng,
            expenses: gastos,
            totalExpenses: totalGas,
            savings: ahorros,
            totalSavings: totalAho
        };
    },

    calcMonthTotals() {
        let totalIng = 0;
        for (let i = 0; i < 3; i++) totalIng += parseFloat(UI.val(`ing-val-${i}`)) || 0;

        let totalGas = 0;
        document.querySelectorAll('.input-gasto').forEach(inp => totalGas += parseFloat(inp.value) || 0);

        let totalAho = 0;
        document.querySelectorAll('.input-ahorro').forEach(inp => totalAho += parseFloat(inp.value) || 0);

        const disponible = totalIng - totalGas - totalAho;

        UI.txt('total-ingresos', UI.fmt(totalIng));
        UI.txt('total-gastos', UI.fmt(totalGas));
        UI.txt('total-ahorros', UI.fmt(totalAho));

        UI.txt('r-ingresos', UI.fmt(totalIng));
        UI.txt('r-gastos', UI.fmt(totalGas));
        UI.txt('r-ahorros', UI.fmt(totalAho));
        UI.txt('r-disponible', UI.fmt(disponible));

        this.saveTempMonthData();
    },

    saveTempMonthData() {
        Store.data.currentMonth.incomes = [0,1,2].map(i => ({
            v: parseFloat(UI.val(`ing-val-${i}`)) || 0,
            d: UI.val(`ing-desc-${i}`)
        }));

        const gastos = {};
        document.querySelectorAll('.input-gasto').forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            if (v) gastos[inp.dataset.cat] = v;
        });
        Store.data.currentMonth.gastos = gastos;

        const ahorros = {};
        document.querySelectorAll('.input-ahorro').forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            if (v) ahorros[inp.dataset.cat] = v;
        });
        Store.data.currentMonth.ahorros = ahorros;

        Store.save();
    },

    calcInitTotals() {
        const money = parseFloat(UI.val('init-disponible')) || 0;
        let savingsTotal = 0;
        document.querySelectorAll('.input-init').forEach(inp => {
            savingsTotal += parseFloat(inp.value) || 0;
        });

        UI.txt('init-val-disp', UI.fmt(money));
        UI.txt('init-val-aho', UI.fmt(savingsTotal));
        UI.txt('init-val-total', UI.fmt(money + savingsTotal));
    },

    saveInitial() {
        Store.data.initial.money = parseFloat(UI.val('init-disponible')) || 0;
        const savings = {};
        document.querySelectorAll('.input-init').forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            if (v) savings[inp.dataset.cat] = v;
        });
        Store.data.initial.savings = savings;
        Store.save();
        UI.toast('✅ Saldos iniciales guardados');
        this.updateAll();
    },

    saveMonth() {
        const monthIdx = parseInt(UI.val('month-select'));
        const year = UI.val('year-select');
        const monthYear = `${CONFIG.months[monthIdx]} ${year}`;
        const formData = this.getCurrentFormData();

        if (formData.totalIncome === 0 && formData.totalExpenses === 0 && formData.totalSavings === 0) {
            return UI.toast('⚠️ Registro vacío', 'error');
        }

        const exists = Store.data.history.find(h => h.monthYear === monthYear);

        if (exists) {
            // Lógica de Actualización vs Sobrescritura
            const action = prompt(
                `El mes ${monthYear} ya tiene registros:\n` +
                `- Ingresos: ${UI.fmt(exists.totalIncome)}\n` +
                `- Disponible: ${UI.fmt(exists.available)}\n\n` +
                `Escribe "1" para SUMAR los nuevos valores.\n` +
                `Escribe "2" para SOBRESCRIBIR con los nuevos valores.`
            );

            if (action === '1') {
                Store.mergeMonth(monthYear, formData);
                UI.toast(`✅ Datos sumados a ${monthYear}`);
            } else if (action === '2') {
                if(!confirm('¿Seguro de sobrescribir? Se perderán los datos anteriores del mes.')) return;
                // Sobrescribir: Filtrar y agregar nuevo
                Store.data.history = Store.data.history.filter(h => h.monthYear !== monthYear);
                this.pushNewMonth(monthYear, formData);
                UI.toast(`✅ ${monthYear} sobrescrito`);
            } else {
                return; // Cancelar
            }
        } else {
            // Nuevo mes
            this.pushNewMonth(monthYear, formData);
            UI.toast(`✅ ${monthYear} guardado`);
        }

        // Limpiar formulario y Recargar
        Store.data.currentMonth = { incomes: [{v:0,d:''},{v:0,d:''},{v:0,d:''}], gastos: {}, ahorros: {} };
        Store.save();
        this.resetMonthInputs();
        this.updateAll();
    },

    pushNewMonth(monthYear, data) {
        Store.data.history.push({
            monthYear,
            incomes: data.incomes,
            totalIncome: data.totalIncome,
            expenses: data.expenses, // {Arriendo: 1000, Agua: 50...}
            totalExpenses: data.totalExpenses,
            savings: data.savings, // {Viaje: 200...}
            totalSavings: data.totalSavings,
            available: data.totalIncome - data.totalExpenses - data.totalSavings,
            date: new Date().toISOString()
        });
    },

    resetMonthInputs() {
        this.setupIncomesGrid();
        this.renderMonthInputs();
        this.calcMonthTotals();
    },

    addVariableExpense() {
        const amount = parseFloat(UI.val('gv-monto'));
        if (!amount || amount <= 0) return UI.toast('Ingresa un monto válido', 'error');

        Store.data.variableExpenses.push({
            id: Date.now(),
            category: UI.val('gv-cat'),
            amount,
            description: UI.val('gv-desc'),
            date: UI.val('gv-fecha')
        });
        Store.save();
        UI.setVal('gv-monto', '');
        UI.setVal('gv-desc', '');
        UI.toast('✅ Gasto registrado');
        this.updateAll();
    },

    addWithdrawal() {
        const cat = UI.val('ret-cat');
        const amount = parseFloat(UI.val('ret-monto'));
        const desc = UI.val('ret-desc');
        if (!amount || amount <= 0 || !desc) return UI.toast('Completa todos los campos', 'error');

        const { balances, available } = Store.getBalances();
        if (cat === 'DISPONIBLE' && available < amount) return UI.toast('Saldo insuficiente', 'error');
        if (cat !== 'DISPONIBLE' && (balances[cat] || 0) < amount) return UI.toast('Saldo insuficiente', 'error');

        Store.data.withdrawals.push({
            id: Date.now(),
            category: cat,
            amount,
            description: desc,
            date: UI.val('ret-fecha')
        });
        Store.save();
        UI.setVal('ret-monto', '');
        UI.setVal('ret-desc', '');
        UI.toast('✅ Retiro registrado');
        this.updateAll();
    },

    updateAll() {
        this.updateWidgets();
        this.updateBalancesTable();
        this.updateDashboard();
        this.updateTrends();
        this.updateHistory();
        this.calcInitTotals();
        Charts.renderAll();
    },

    updateWidgets() {
        const { balances, available } = Store.getBalances();
        const history = Store.data.history;
        const totalAho = Object.values(balances).reduce((a, b) => a + b, 0);

        UI.txt('w-disponible', UI.fmt(available));
        UI.txt('w-ahorros', UI.fmt(totalAho));

        const lastMonth = history[history.length - 1];
        const prevMonth = history[history.length - 2];
        UI.txt('w-gastos', lastMonth ? UI.fmt(lastMonth.totalExpenses) : '$0');

        if (lastMonth && prevMonth) {
            const dispChange = ((lastMonth.available - prevMonth.available) / (prevMonth.available || 1) * 100).toFixed(0);
            const ahoChange = ((lastMonth.totalSavings - prevMonth.totalSavings) / (prevMonth.totalSavings || 1) * 100).toFixed(0);
            const gasChange = ((lastMonth.totalExpenses - prevMonth.totalExpenses) / (prevMonth.totalExpenses || 1) * 100).toFixed(0);

            const setTrend = (id, val, reverse=false) => {
                const el = UI.$(id);
                el.textContent = `${val >= 0 ? '↑' : '↓'} ${Math.abs(val)}%`;
                let isGood = val >= 0;
                if (reverse) isGood = !isGood;
                el.className = `widget-trend ${isGood ? 'up' : 'down'}`;
            };

            setTrend('w-disponible-trend', dispChange);
            setTrend('w-ahorros-trend', ahoChange);
            setTrend('w-gastos-trend', gasChange, true); // Gastos: Subir es malo (rojo)
        }

        if (history.length >= 2) {
             const avg = history.reduce((a, b) => a + b.totalExpenses, 0) / history.length;
             UI.txt('w-prediccion', UI.fmt(avg));
        }
    },

    updateTrends() {
        const history = Store.data.history;
        if (history.length < 2) {
            UI.txt('trend-gastos', '-');
            UI.txt('trend-ahorros', '-');
            UI.txt('trend-ingresos', '-');
            UI.txt('trend-summary', 'Necesitas al menos 2 meses de datos para ver tendencias.');
            return;
        }

        const calcTrend = (values) => {
            if (values.length < 2) return { direction: 'stable', pct: 0 };
            const recent = values.slice(-3);
            const first = recent[0];
            const last = recent[recent.length - 1];
            const pct = ((last - first) / (first || 1) * 100).toFixed(0);
            return { direction: pct > 5 ? 'up' : pct < -5 ? 'down' : 'stable', pct };
        };

        const gasTrend = calcTrend(history.map(h => h.totalExpenses));
        const ahoTrend = calcTrend(history.map(h => h.totalSavings));
        const ingTrend = calcTrend(history.map(h => h.totalIncome));

        const trendIcon = (t) => t.direction === 'up' ? '📈 Subiendo' : t.direction === 'down' ? '📉 Bajando' : '➡️ Estable';
        const trendClass = (t) => `trend-indicator trend-${t.direction}`;

        const setEl = (id, t) => {
            const el = UI.$(id);
            el.textContent = trendIcon(t);
            el.className = trendClass(t);
        };

        setEl('trend-gastos', gasTrend);
        setEl('trend-ahorros', ahoTrend);
        setEl('trend-ingresos', ingTrend);

        let summary = [];
        if (gasTrend.direction === 'up') summary.push('⚠️ Tus gastos están aumentando.');
        else if (gasTrend.direction === 'down') summary.push('✅ Tus gastos están disminuyendo.');
        
        if (ahoTrend.direction === 'up') summary.push('💪 Estás ahorrando más.');
        else if (ahoTrend.direction === 'down') summary.push('📉 Tu ahorro disminuye.');

        UI.txt('trend-summary', summary.join(' ') || 'Tus finanzas se mantienen estables.');
    },

    updateBalancesTable() {
        const { balances, available } = Store.getBalances();
        const tbody = UI.$('balances-table').querySelector('tbody');
        tbody.innerHTML = '';

        const trDisp = document.createElement('tr');
        trDisp.innerHTML = `
            <td><strong>💵 Disponible</strong></td>
            <td style="color:${available<0?'#ef4444':'#22c55e'};font-weight:700">${UI.fmt(available)}</td>
            <td><button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem" onclick="App.prefillWithdraw('DISPONIBLE')">Usar</button></td>
        `;
        tbody.appendChild(trDisp);

        Object.entries(balances).sort((a,b) => b[1]-a[1]).forEach(([cat, val]) => {
            if (val !== 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${cat}</td>
                    <td style="font-weight:600">${UI.fmt(val)}</td>
                    <td><button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem" onclick="App.prefillWithdraw('${cat}')">Retirar</button></td>
                `;
                tbody.appendChild(tr);
            }
        });

        const retSel = UI.$('ret-cat');
        retSel.innerHTML = '<option value="DISPONIBLE">💵 Disponible</option>';
        Object.keys(balances).sort().forEach(cat => {
            if (balances[cat]) retSel.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
    },

    updateDashboard() {
        const stats = Store.getStats();
        const { balances, available } = Store.getBalances();
        const history = Store.data.history;

        UI.txt('d-ing-acum', UI.fmt(stats.totalIng));
        UI.txt('d-gas-acum', UI.fmt(stats.totalGas));
        UI.txt('d-aho-acum', UI.fmt(stats.totalAho));
        UI.txt('d-disponible', UI.fmt(available));

        UI.txt('d-mayor-gasto', stats.maxExpName);

        const months = history.length || 1;
        UI.txt('d-prom-gasto', UI.fmt(stats.totalGas / months));
        UI.txt('d-prom-ahorro', UI.fmt(stats.totalAho / months));

        if (history.length >= 2) {
             const avg = history.reduce((a, b) => a + b.totalExpenses, 0) / months;
             UI.txt('d-prediccion', UI.fmt(avg));
        }

        this.renderComparison();
    },

    renderComparison() {
        const container = UI.$('comparison-container');
        const history = Store.data.history;
        if (history.length < 2) {
            container.innerHTML = '<p class="empty-state">Necesitas al menos 2 registros</p>';
            return;
        }

        const last = history[history.length - 1];
        const prev = history[history.length - 2];

        const calcChange = (curr, old) => {
            if (!old) return { pct: 0, cls: '' };
            const pct = ((curr - old) / old * 100).toFixed(1);
            return { pct, cls: pct >= 0 ? 'change-positive' : 'change-negative' };
        };

        const ingChange = calcChange(last.totalIncome, prev.totalIncome);
        // Gastos: Negativo es "bueno" (verde), Positivo es "malo" (rojo)
        const gasPct = ((last.totalExpenses - prev.totalExpenses) / (prev.totalExpenses || 1) * 100).toFixed(1);
        const gasCls = gasPct <= 0 ? 'change-positive' : 'change-negative'; 
        
        const ahoChange = calcChange(last.totalSavings, prev.totalSavings);

        container.innerHTML = `
            <div class="comparison-item">
                <div class="comparison-label">Ingresos</div>
                <div class="comparison-value">${UI.fmt(last.totalIncome)}</div>
                <div class="comparison-change ${ingChange.cls}">${ingChange.pct >= 0 ? '+' : ''}${ingChange.pct}%</div>
            </div>
            <div class="comparison-item">
                <div class="comparison-label">Gastos</div>
                <div class="comparison-value">${UI.fmt(last.totalExpenses)}</div>
                <div class="comparison-change ${gasCls}">${gasPct >= 0 ? '+' : ''}${gasPct}%</div>
            </div>
            <div class="comparison-item">
                <div class="comparison-label">Ahorros</div>
                <div class="comparison-value">${UI.fmt(last.totalSavings)}</div>
                <div class="comparison-change ${ahoChange.cls}">${ahoChange.pct >= 0 ? '+' : ''}${ahoChange.pct}%</div>
            </div>
        `;
    },

    updateHistory() {
        // Optimización: DocumentFragment
        const tbody = UI.$('history-table').querySelector('tbody');
        tbody.innerHTML = '';
        const fragment = document.createDocumentFragment();

        Store.data.history.slice().reverse().forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${h.monthYear}</strong></td>
                <td style="color:#3b82f6">${UI.fmt(h.totalIncome)}</td>
                <td style="color:#ef4444">${UI.fmt(h.totalExpenses)}</td>
                <td style="color:#8b5cf6">${UI.fmt(h.totalSavings)}</td>
                <td style="color:#22c55e;font-weight:700">${UI.fmt(h.available)}</td>
                <td style="font-size:0.8rem;color:#94a3b8">${new Date(h.date).toLocaleDateString()}</td>
                <td><button class="btn btn-secondary" style="padding:4px 8px;font-size:0.75rem" onclick="App.deleteMonth('${h.monthYear}')">🗑️</button></td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    },

    deleteMonth(monthYear) {
        if (!confirm(`¿Eliminar ${monthYear}?`)) return;
        Store.data.history = Store.data.history.filter(h => h.monthYear !== monthYear);
        Store.save();
        this.updateAll();
        UI.toast('🗑️ Registro eliminado');
    },

    prefillWithdraw(cat) {
        UI.setVal('ret-cat', cat);
        UI.$('ret-monto').focus();
    },

    // Categorías personalizables
    openCategories() {
        UI.$('categories-modal').style.display = 'flex';
        this.renderCategoryLists();
    },

    closeCategories() {
        UI.$('categories-modal').style.display = 'none';
    },

    showCatTab(type) {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.cat-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.cat-tab[onclick="App.showCatTab('${type}')"]`).classList.add('active');
        UI.$(`cat-content-${type}`).classList.add('active');
    },

    renderCategoryLists() {
        ['gastos', 'ahorros', 'variables'].forEach(type => {
            const list = UI.$(`list-${type}`);
            const defaults = DEFAULT_CONFIG[type === 'gastos' ? 'gastosFijos' : type];
            const custom = Store.data.customCategories[type] || [];

            list.innerHTML = '';
            [...defaults, ...custom].forEach(cat => {
                const isCustom = custom.includes(cat);
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${cat}</span>
                    ${isCustom ? `<button onclick="App.removeCategory('${type}', '${cat}')">🗑️</button>` : '<span style="color:#64748b;font-size:0.8rem">predefinida</span>'}
                `;
                list.appendChild(li);
            });
        });
    },

    addCategory(type) {
        const input = UI.$(`new-cat-${type}`);
        const name = input.value.trim();
        if (!name) return UI.toast('Ingresa un nombre', 'error');

        const defaults = DEFAULT_CONFIG[type === 'gastos' ? 'gastosFijos' : type];
        const custom = Store.data.customCategories[type] || [];

        if ([...defaults, ...custom].includes(name)) {
            return UI.toast('La categoría ya existe', 'error');
        }

        Store.data.customCategories[type].push(name);
        Store.save();
        Store.loadCustomCategories();
        input.value = '';
        this.renderCategoryLists();
        this.renderMonthInputs();
        this.renderInitialInputs();
        this.populateVariableCategories();
        UI.toast('✅ Categoría agregada');
    },

    removeCategory(type, name) {
        if (!confirm(`¿Eliminar "${name}"?`)) return;
        Store.data.customCategories[type] = Store.data.customCategories[type].filter(c => c !== name);
        Store.save();
        Store.loadCustomCategories();
        this.renderCategoryLists();
        this.renderMonthInputs();
        this.renderInitialInputs();
        this.populateVariableCategories();
        UI.toast('🗑️ Categoría eliminada');
    },

    switchTab(tabId, btn) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        UI.$(tabId).classList.add('active');
        if (btn) btn.classList.add('active');
        // window.scrollTo(0, 0); // Opcional, a veces molesta
        if (tabId === 'tab-graficos') Charts.renderAll();
    },

    exportJSON() {
        const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `control_gastos_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        UI.toast('📤 JSON exportado');
        this.closeConfig();
    },

    exportCSV() {
        let csv = 'Mes,Ingresos,Gastos,Ahorros,Disponible,Fecha\n';
        Store.data.history.forEach(h => {
            csv += `${h.monthYear},${h.totalIncome},${h.totalExpenses},${h.totalSavings},${h.available},${h.date}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `control_gastos_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        UI.toast('📥 CSV exportado');
        this.closeConfig();
    },

    importJSON(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                Store.data = JSON.parse(e.target.result);
                Store.save();
                location.reload();
            } catch (err) {
                UI.toast('Error al importar', 'error');
            }
        };
        reader.readAsText(file);
    },

    openConfig() { UI.$('config-modal').style.display = 'flex'; },
    closeConfig() { UI.$('config-modal').style.display = 'none'; },
    resetAll() { if (confirm('⚠️ ¿Borrar TODOS los datos?')) Store.reset(); }
};

document.addEventListener('DOMContentLoaded', () => App.init());