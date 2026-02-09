import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Printer, 
  Plus, 
  History, 
  List, 
  Search, 
  FileText, 
  Trash2, 
  Edit, 
  Save, 
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  CheckSquare,
  Square,
  Upload,
  Scroll,
  Layers
} from 'lucide-react';

// --- Types ---
type OrderType = 'sheet' | 'roll';

interface Order {
  id: string;
  type: OrderType; // Distinguish between Sheet (In Tờ) and Roll (In Cuộn)
  code: string;
  customer: string;
  productName: string;
  colors: number;
  colorNames: string;
  printer: string;
  dateInput: string;
  shelf: string; // Used as "Thứ tự nhập kho" for Roll
  note: string;
  totalPrinted: number;
  status: 'New' | 'Printing' | 'Done';
}

interface PrintLog {
  id: string;
  orderId: string;
  productName: string;
  colorIndex: number; 
  timestamp: string;
  user: string;
  type: OrderType;
}

// --- Mock Data (Fallback) ---
const MOCK_ORDERS: Order[] = [
  {
    id: '1',
    type: 'sheet',
    code: '0C86GSK14',
    customer: 'VNM',
    productName: 'Q1SX05: Thùng SĐ NSPN Xanh 380g (N002-TV)',
    colors: 2,
    colorNames: 'Đỏ, Xanh Dương',
    printer: 'Máy in 7 màu',
    dateInput: '2025-08-01',
    shelf: 'A-01',
    note: '',
    totalPrinted: 0,
    status: 'New'
  },
  {
    id: '2',
    type: 'roll',
    code: 'TG300',
    customer: 'HVN',
    productName: 'Case WA Can TIGER 24x330ml SLK VN (261214B-11)',
    colors: 5,
    colorNames: 'Cyan, Magenta, Yellow, Black, White',
    printer: 'TG300',
    dateInput: '2025-10-01',
    shelf: '1',
    note: '',
    totalPrinted: 0,
    status: 'New'
  }
];

const SHEET_PRINTERS = [
  "Máy in 7 màu",
  "Máy in 6 màu",
  "Máy Offset",
  "Máy Flexo"
];

const ROLL_PRINTERS = [
  "Máy in Cuộn",
  "TG300",
  "TG500",
  "Indigo"
];

// --- Google Apps Script Helper ---
const runGAS = (funcName: string, ...args: any[]) => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (window.google && window.google.script) {
      // @ts-ignore
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        [funcName](...args);
    } else {
      console.log(`[Dev Mode] Calling GAS function: ${funcName}`, args);
      setTimeout(() => {
        if (funcName === 'getAllOrders') resolve(MOCK_ORDERS);
        if (funcName === 'addOrder') resolve({ success: true, message: 'Added locally' });
        if (funcName === 'addOrdersBulk') resolve({ success: true, message: 'Imported' });
        if (funcName === 'updateOrder') resolve({ success: true, message: 'Updated locally' });
        if (funcName === 'deleteOrder') resolve({ success: true, message: 'Deleted locally' });
        if (funcName === 'logPrintAction') resolve({ success: true });
        if (funcName === 'getPrintHistory') resolve([]);
      }, 500);
    }
  });
};

const App = () => {
  // --- State ---
  const [currentModule, setCurrentModule] = useState<OrderType>('sheet'); // 'sheet' or 'roll'
  const [activeTab, setActiveTab] = useState<'orders' | 'input' | 'print' | 'history'>('orders');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<PrintLog[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Selection & Form
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Order>>({});
  
  // Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');

  // Print Mode
  const [printQueue, setPrintQueue] = useState<Order[]>([]);
  const [hiddenTickets, setHiddenTickets] = useState<Set<string>>(new Set()); 

  // --- Effects ---
  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = () => {
    setLoading(true);
    runGAS('getAllOrders')
      .then((data: any) => {
        setOrders(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const loadHistory = () => {
    setLoading(true);
    runGAS('getPrintHistory')
      .then((data: any) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  // Filter orders based on current module
  const filteredOrders = orders.filter(o => o.type === currentModule);

  // --- Helpers ---
  const getColorName = (order: Order, index: number) => {
    if (!order.colorNames) return `MÀU ${index}`;
    const parts = order.colorNames.split(',').map(s => s.trim());
    return parts[index - 1] || `MÀU ${index}`;
  };

  const getColorStyle = (text: string) => {
    const t = text.toLowerCase();
    if (t.includes('đỏ') || t.includes('red') || t.includes('magenta')) return 'text-red-600';
    if (t.includes('xanh dương') || t.includes('blue') || t.includes('cyan')) return 'text-blue-600';
    if (t.includes('xanh lá') || t.includes('green')) return 'text-green-600';
    if (t.includes('vàng') || t.includes('yellow')) return 'text-yellow-600';
    if (t.includes('cam') || t.includes('orange')) return 'text-orange-600';
    if (t.includes('tím') || t.includes('purple')) return 'text-purple-600';
    if (t.includes('đen') || t.includes('black')) return 'text-black';
    return 'text-gray-900';
  };

  // --- Actions ---
  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    let c = Number(formData.colors) || 1;
    if (c < 1) c = 1;
    if (c > 7) c = 7;

    const payload = {
      ...formData,
      id: editingId || undefined,
      type: currentModule, // Save with current module type
      colors: c,
      totalPrinted: 0,
      status: 'New'
    };

    const action = editingId ? 'updateOrder' : 'addOrder';
    
    runGAS(action, payload).then(() => {
      loadOrders();
      setFormData({});
      setEditingId(null);
      setActiveTab('orders');
    });
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    setLoading(true);

    const rows = importText.trim().split('\n');
    const newOrders: any[] = [];
    
    rows.forEach(row => {
        const cols = row.split('\t');
        if (cols.length >= 3) {
            newOrders.push({
                type: currentModule, // Import into current module
                code: cols[0] || '',
                productName: cols[1] || '',
                customer: cols[2] || '',
                colors: parseInt(cols[3]) || 1,
                colorNames: cols[4] || '',
                printer: cols[5] || (currentModule === 'roll' ? 'TG300' : 'Máy in 7 màu'),
                shelf: cols[6] || '',
                dateInput: cols[7] || new Date().toISOString().split('T')[0],
                status: 'New',
                totalPrinted: 0
            });
        }
    });

    runGAS('addOrdersBulk', newOrders).then(() => {
        loadOrders();
        setImportText('');
        setShowImportModal(false);
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa đơn này?')) {
      setLoading(true);
      runGAS('deleteOrder', id).then(() => {
        loadOrders();
        setSelectedOrderIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
  };

  const handleEdit = (order: Order) => {
    setFormData(order);
    setEditingId(order.id);
    setActiveTab('input');
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkPrint = () => {
    if (selectedOrderIds.size === 0) return alert('Vui lòng chọn ít nhất 1 đơn hàng!');
    const selected = orders.filter(o => selectedOrderIds.has(o.id));
    setPrintQueue(selected);
    setHiddenTickets(new Set());
    setActiveTab('print');
  };

  const handleSinglePrint = (order: Order) => {
    setPrintQueue([order]);
    setHiddenTickets(new Set());
    setActiveTab('print');
  };

  const toggleTicketVisibility = (orderId: string, colorIndex: number) => {
    const key = `${orderId}-${colorIndex}`;
    setHiddenTickets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirmPrint = (order: Order, colorIndex: number) => {
    runGAS('logPrintAction', order.id, colorIndex, order.productName)
      .then(() => {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, totalPrinted: o.totalPrinted + 1, status: 'Printing' } : o));
      });
  };

  // --- Views ---

  const renderSidebar = () => (
    <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col h-screen fixed left-0 top-0 z-10 no-print">
      <div className="flex flex-col px-6 py-6 border-b border-gray-100 bg-blue-50">
        <h1 className="font-bold text-lg text-blue-900 leading-tight">CÔNG TY CỔ PHẦN MPPACK</h1>
        <p className="text-[10px] text-blue-600 mt-1 font-semibold uppercase tracking-wider">Quản Lý Bản In</p>
        <p className="text-[10px] text-gray-400 mt-2 italic">Thiết kế bởi NGUYỄN THÁI</p>
      </div>
      
      <div className="p-4 space-y-2">
         <button
            onClick={() => { setCurrentModule('sheet'); setActiveTab('orders'); setSelectedOrderIds(new Set()); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${currentModule === 'sheet' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
         >
            <Layers className="w-5 h-5" />
            Quản lý bản in 6, 7 Màu
         </button>
         <button
            onClick={() => { setCurrentModule('roll'); setActiveTab('orders'); setSelectedOrderIds(new Set()); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${currentModule === 'roll' ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
         >
            <Scroll className="w-5 h-5" />
            Quản Lý In Cuộn
         </button>
      </div>

      <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Menu Chức Năng
      </div>

      <nav className="p-2 space-y-1 flex-1">
        <button 
          onClick={() => setActiveTab('orders')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <List className="w-5 h-5" />
          Danh Sách Đơn
        </button>

        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({});
            setActiveTab('input');
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'input' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Plus className="w-5 h-5" />
          Thêm Mới
        </button>

        <button 
          onClick={() => {
            setShowImportModal(true);
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-gray-600 hover:bg-gray-50`}
        >
          <Upload className="w-5 h-5" />
          Nhập Excel
        </button>

        <button 
          onClick={() => {
            setActiveTab('history');
            loadHistory();
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <History className="w-5 h-5" />
          Lịch Sử
        </button>
      </nav>
    </div>
  );

  const renderImportModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800">
                   Nhập dữ liệu: {currentModule === 'sheet' ? 'IN TỜ' : 'IN CUỘN'}
                </h3>
                <button onClick={() => setShowImportModal(false)} className="text-gray-500 hover:text-red-500">
                    <X className="w-6 h-6" />
                </button>
            </div>
            <div className="p-6 flex-1 overflow-auto">
                <p className="text-sm text-gray-600 mb-2">
                    Copy các cột từ file Excel theo thứ tự: <br/>
                    <span className="font-mono bg-gray-100 px-1 rounded">
                      Mã Code | Tên Sản Phẩm | Khách Hàng | Số Màu | Chi Tiết Màu | Máy In | Vị Trí | Ngày
                    </span>
                </p>
                <textarea 
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    className="w-full h-64 border border-gray-300 rounded p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={`Ví dụ:\n0C86GSK14\tThùng SĐ\tVNM\t2\tĐỏ, Xanh\tMáy in 7 màu\tA-01\t2025-08-01\n...`}
                />
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Hủy</button>
                <button onClick={handleImport} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Xử Lý & Thêm Mới
                </button>
            </div>
        </div>
    </div>
  );

  // --- RENDER: SHEET TICKET LAYOUT ---
  const renderSheetTicket = (order: Order, colorNum: number, isHidden: boolean) => {
    const key = `${order.id}-${colorNum}`;
    const colorName = getColorName(order, colorNum);
    const colorClass = getColorStyle(colorName);
    
    return (
      <div key={key} className={`relative mb-4 ${isHidden ? 'opacity-40 no-print' : ''}`}>
        <div className="print-area-visible page-break-inside-avoid bg-white shadow-lg print:shadow-none border print:border-none">
          <table className="w-full border-collapse border border-black font-sans text-gray-900">
            <tbody>
              <tr>
                <td rowSpan={2} className="border border-black text-center text-6xl font-black w-20 p-0 bg-white leading-none">
                  {colorNum}
                </td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] w-24 uppercase text-center align-middle">KHÁCH HÀNG</td>
                <td className="border border-black font-bold p-1 text-center text-lg align-middle">{order.customer}</td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] w-20 uppercase text-center align-middle">MÁY IN</td>
                <td className="border border-black font-bold p-1 text-center text-lg align-middle w-32 uppercase">{order.printer}</td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] w-20 uppercase text-center align-middle">TỔNG MÀU</td>
                <td className="border border-black bg-blue-500 text-white font-black p-1 text-center text-xl w-16 align-middle">{order.colors}</td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] w-24 uppercase text-center align-middle">NGÀY NHẬP</td>
                <td className="border border-black font-bold p-1 text-center text-base align-middle">{order.dateInput || '...'}</td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] w-20 uppercase text-center align-middle">THỨ TỰ</td>
                <td className="border border-black font-bold p-1 text-center w-12 align-middle">1</td>
              </tr>
              <tr>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] uppercase text-center align-middle">MÃ CODE</td>
                <td colSpan={3} className="border border-black font-black p-1 text-center text-2xl align-middle">{order.code}</td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] uppercase text-center align-middle">ĐƠN VỊ</td>
                <td className="border border-black font-black p-1 text-center text-red-600 text-2xl align-middle">{colorNum}</td>
                <td className="border border-black bg-orange-200 font-bold p-1 text-[10px] uppercase text-center align-middle">MÀU IN</td>
                <td className={`border border-black font-black p-1 text-center ${colorClass} text-xl uppercase align-middle whitespace-nowrap overflow-hidden`}>
                  {colorName}
                </td>
                <td colSpan={2} className="border border-black font-black p-1 text-center text-2xl align-middle">1</td>
              </tr>
              <tr>
                <td className="border border-black bg-orange-200 font-bold p-2 text-xs uppercase text-center align-middle">TÊN SẢN PHẨM</td>
                <td colSpan={10} className="border border-black font-black p-2 text-3xl uppercase leading-tight align-middle text-center">
                  {order.productName}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {renderTicketActions(order, colorNum, isHidden)}
      </div>
    );
  };

  // --- RENDER: ROLL TICKET LAYOUT (Specific to new requirement) ---
  const renderRollTicket = (order: Order, colorNum: number, isHidden: boolean) => {
    const key = `${order.id}-${colorNum}`;
    
    return (
      <div key={key} className={`relative mb-6 ${isHidden ? 'opacity-40 no-print' : ''}`}>
        <div className="print-area-visible page-break-inside-avoid bg-white shadow-lg print:shadow-none">
          <table className="w-full border-separate border-spacing-0 border-2 border-black font-sans text-gray-900">
             <tbody>
                {/* Row 1: Number, Customer, Printer, InCuon */}
                <tr>
                   <td rowSpan={3} className="border border-black text-center text-8xl font-black w-24 p-0 leading-none">{colorNum}</td>
                   <td className="border border-black bg-orange-100 font-bold text-xs uppercase p-1 w-24 text-center align-middle">KHÁCH HÀNG</td>
                   <td className="border border-black font-bold text-2xl text-center align-middle uppercase">{order.customer}</td>
                   <td className="border border-black bg-orange-100 font-bold text-xs uppercase p-1 w-20 text-center align-middle">MÁY IN</td>
                   <td className="border border-black font-bold text-2xl text-center align-middle uppercase w-32">IN CUỘN</td>
                </tr>
                
                {/* Row 2: Code, Printer Name */}
                <tr>
                   <td className="border border-black bg-orange-100 font-bold text-xs uppercase p-1 text-center align-middle">MÃ CODE</td>
                   <td colSpan={3} className="border border-black font-bold text-2xl text-center align-middle">{order.printer}</td>
                </tr>

                {/* Row 3: Product Name Block */}
                <tr>
                   <td colSpan={4} className="border border-black font-black text-3xl text-center p-4 leading-tight">
                      <div className="text-left text-xs font-bold mb-1 uppercase text-gray-500">Tên Sản Phẩm</div>
                      {order.productName}
                      <div className="text-center text-xl font-bold mt-2">({order.code})</div>
                   </td>
                </tr>

                {/* Footer Row */}
                <tr>
                   <td className="border border-black bg-orange-100 font-bold text-xs uppercase p-2 text-center">TỔNG MÀU</td>
                   <td className="border border-black font-black text-2xl text-center p-1">{order.colors}</td>
                   <td className="border border-black bg-orange-100 font-bold text-xs uppercase p-2 text-center">THỨ TỰ NHẬP KHO</td>
                   <td className="border border-black font-black text-2xl text-center p-1">{order.shelf || '1'}</td>
                   <td className="border border-black font-black text-2xl text-center p-1">1</td>
                </tr>

                {/* Date Row */}
                <tr>
                    <td className="border border-black bg-orange-100 font-bold text-xs uppercase p-2 text-center">NGÀY NHẬP</td>
                    <td colSpan={4} className="border border-black font-bold text-xl text-center p-1">{order.dateInput}</td>
                </tr>
             </tbody>
          </table>
        </div>
        {renderTicketActions(order, colorNum, isHidden)}
      </div>
    );
  };

  const renderTicketActions = (order: Order, colorNum: number, isHidden: boolean) => (
    <div className="absolute top-0 right-0 -mt-8 no-print flex gap-2">
      <div className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded text-sm">
        <input 
          type="checkbox" 
          checked={!isHidden}
          onChange={() => toggleTicketVisibility(order.id, colorNum)}
          className="w-4 h-4 cursor-pointer"
        />
        <span className={isHidden ? 'text-gray-400 line-through' : 'font-bold'}>In Mẫu Này</span>
      </div>
      <button 
      onClick={() => handleConfirmPrint(order, colorNum)}
      disabled={isHidden}
      className={`bg-blue-600 text-white px-2 py-1 rounded shadow hover:bg-blue-700 flex items-center gap-1 text-xs font-bold ${isHidden ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <CheckCircle className="w-3 h-3" />
      Log
    </button>
  </div>
  );

  const renderOrderList = () => (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
           <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mr-3 ${currentModule === 'sheet' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
             {currentModule === 'sheet' ? 'MODULE: IN TỜ' : 'MODULE: IN CUỘN'}
           </span>
           <h2 className="text-2xl font-bold text-gray-800 inline-block align-middle">Danh Sách Đơn Hàng</h2>
        </div>
        <div className="flex gap-4">
          {selectedOrderIds.size > 0 && (
             <button 
               onClick={handleBulkPrint}
               className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition-colors"
             >
               <Printer className="w-4 h-4" />
               In {selectedOrderIds.size} Đơn Đã Chọn
             </button>
          )}
          {loading && <Loader2 className="animate-spin text-blue-600 mt-2" />}
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-4 w-10">
                <div className="flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-gray-300" />
                </div>
              </th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider">Mã Đơn</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider">Sản Phẩm</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center">Màu</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider">Máy In</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center">Đã In</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider">Trạng Thái</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right">Hành Động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredOrders.map((order) => (
              <tr key={order.id} className={`hover:bg-blue-50 transition-colors group ${selectedOrderIds.has(order.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-4 text-center">
                  <button onClick={() => toggleSelectOrder(order.id)} className="text-gray-500 hover:text-blue-600">
                    {selectedOrderIds.has(order.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 font-medium text-blue-600">{order.code}</td>
                <td className="px-6 py-4 text-gray-800 font-medium">
                  {order.productName}
                  <div className="text-xs text-gray-400 font-normal mt-1">{order.customer}</div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
                    {order.colors}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 text-sm">{order.printer}</td>
                <td className="px-6 py-4 text-center font-mono text-gray-600">{order.totalPrinted}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${order.status === 'New' ? 'bg-green-100 text-green-800' : ''}
                    ${order.status === 'Printing' ? 'bg-blue-100 text-blue-800' : ''}
                  `}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleSinglePrint(order)}
                      className="p-2 text-white bg-orange-500 rounded hover:bg-orange-600 transition-colors" title="In Ấn">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleEdit(order)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded transition-colors" title="Sửa">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(order.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors" title="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredOrders.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">Chưa có dữ liệu cho module này</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderInputForm = () => (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className={`${currentModule === 'sheet' ? 'bg-blue-600' : 'bg-orange-500'} px-8 py-6 flex justify-between items-center`}>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6" />
            {editingId ? 'Cập Nhật Đơn Hàng' : 'Tạo Đơn Hàng Mới'} ({currentModule === 'sheet' ? 'In Tờ' : 'In Cuộn'})
          </h2>
          <button onClick={() => setActiveTab('orders')} className="text-white hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSaveOrder} className="p-8 grid grid-cols-2 gap-6">
          <div className="col-span-1 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Mã Code / ID</label>
            <input 
              required
              value={formData.code || ''}
              onChange={e => setFormData({...formData, code: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="VD: 0C86GSK14"
            />
          </div>

          <div className="col-span-1 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Khách Hàng</label>
            <input 
              required
              value={formData.customer || ''}
              onChange={e => setFormData({...formData, customer: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="VD: VNM"
            />
          </div>

          <div className="col-span-2 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Tên Sản Phẩm</label>
            <input 
              required
              value={formData.productName || ''}
              onChange={e => setFormData({...formData, productName: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Tên đầy đủ của sản phẩm..."
            />
          </div>

          <div className="col-span-1 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Số Màu (Max: 7)</label>
            <input 
              type="number"
              min="1"
              max="7"
              required
              value={formData.colors || ''}
              onChange={e => setFormData({...formData, colors: parseInt(e.target.value)})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Nhập 1-7"
            />
          </div>

          <div className="col-span-1 space-y-2">
             <label className="text-sm font-semibold text-gray-700">Chi tiết Màu (cách nhau dấu phẩy)</label>
             <input 
               type="text"
               value={formData.colorNames || ''}
               onChange={e => setFormData({...formData, colorNames: e.target.value})}
               className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
               placeholder="VD: Đỏ, Xanh Dương, Vàng, Đen..."
             />
             <p className="text-xs text-gray-500">Nếu để trống sẽ hiện "MÀU 1", "MÀU 2"...</p>
          </div>

          <div className="col-span-1 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Máy In</label>
            <select 
              value={formData.printer || (currentModule === 'sheet' ? 'Máy in 7 màu' : 'Máy in Cuộn')}
              onChange={e => setFormData({...formData, printer: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {(currentModule === 'sheet' ? SHEET_PRINTERS : ROLL_PRINTERS).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="col-span-1 space-y-2">
            <label className="text-sm font-semibold text-gray-700">
               {currentModule === 'sheet' ? 'Mã Kệ / Vị Trí' : 'Thứ Tự Nhập Kho'}
            </label>
            <input 
              value={formData.shelf || ''}
              onChange={e => setFormData({...formData, shelf: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder={currentModule === 'sheet' ? "VD: A-01" : "VD: 1"}
            />
          </div>

          <div className="col-span-1 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Ngày nhập</label>
            <input 
              type="date"
              value={formData.dateInput || ''}
              onChange={e => setFormData({...formData, dateInput: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="col-span-2 space-y-2">
            <label className="text-sm font-semibold text-gray-700">Ghi Chú</label>
            <textarea 
              rows={3}
              value={formData.note || ''}
              onChange={e => setFormData({...formData, note: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="col-span-2 pt-4 border-t border-gray-100 flex justify-end gap-3">
            <button 
              type="button"
              onClick={() => setActiveTab('orders')}
              className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
            <button 
              type="submit"
              className={`px-6 py-2 text-white font-medium rounded-lg hover:opacity-90 transition-colors flex items-center gap-2 ${currentModule === 'sheet' ? 'bg-blue-600' : 'bg-orange-500'}`}
            >
              <Save className="w-5 h-5" />
              Lưu Dữ Liệu
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderPrintView = () => {
    if (printQueue.length === 0) return null;

    return (
      <div className="p-8 print:p-0">
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <button onClick={() => setActiveTab('orders')} className="text-gray-500 hover:text-blue-600 flex items-center gap-2 mb-2">
              <X className="w-4 h-4" /> Quay lại danh sách
            </button>
            <h2 className="text-2xl font-bold text-gray-800">
              Chế Độ In Hàng Loạt ({currentModule === 'sheet' ? 'In Tờ' : 'In Cuộn'})
            </h2>
            <p className="text-gray-500">
              Đang xem {printQueue.length} đơn hàng.
            </p>
          </div>
          <button 
            onClick={() => window.print()}
            className="px-6 py-3 bg-gray-800 text-white font-bold rounded-lg hover:bg-black transition-colors flex items-center gap-2"
          >
            <Printer className="w-5 h-5" /> IN (CTRL+P)
          </button>
        </div>

        {/* --- GRID OF TICKETS --- */}
        <div className="flex flex-col items-center">
          {printQueue.map((order) => {
            // For Roll (In Cuộn), we only print 1 ticket regardless of color count.
            // For Sheet (In Tờ), we print N tickets where N = colors.
            const tickets = order.type === 'roll' 
              ? [1] 
              : Array.from({ length: order.colors }, (_, i) => i + 1);

            return (
              <div key={order.id} className="w-full max-w-4xl">
                 <div className="no-print mt-8 mb-4 border-b pb-2">
                    <h3 className="text-lg font-bold text-blue-700">{order.productName}</h3>
                 </div>

                 {tickets.map((colorNum) => {
                   const key = `${order.id}-${colorNum}`;
                   const isHidden = hiddenTickets.has(key);
                   
                   // Check order type to render correct ticket
                   if (order.type === 'sheet') {
                      return renderSheetTicket(order, colorNum, isHidden);
                   } else {
                      return renderRollTicket(order, colorNum, isHidden);
                   }
                 })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Lịch Sử In Ấn</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase">Thời Gian</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase">Loại</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase">Người In</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase">Sản Phẩm</th>
              <th className="px-6 py-4 font-semibold text-xs text-gray-500 uppercase">Chi Tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  {loading ? 'Đang tải...' : 'Chưa có lịch sử in ấn nào.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-600 font-mono text-sm">{log.timestamp}</td>
                  <td className="px-6 py-4">
                     <span className={`text-[10px] font-bold px-2 py-1 rounded ${log.type === 'roll' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                        {log.type === 'roll' ? 'IN CUỘN' : 'IN TỜ'}
                     </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-800">{log.user}</td>
                  <td className="px-6 py-4 text-gray-800">{log.productName}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Đã in Màu {log.colorIndex}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {renderSidebar()}
      
      <main className="flex-1 ml-64 no-print">
        {activeTab === 'orders' && renderOrderList()}
        {activeTab === 'input' && renderInputForm()}
        {activeTab === 'print' && renderPrintView()}
        {activeTab === 'history' && renderHistory()}
      </main>

      {showImportModal && renderImportModal()}

      {/* Special Print Overlay for window.print() */}
      <div className="print-area">
        {renderPrintView()}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);