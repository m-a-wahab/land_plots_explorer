🧠 Project Overview
A .NET Web Application that visualizes land plots from a JSON dataset (~6000 records) on Google Maps, with filtering and categorization based on rental status.

The system should:
Load and process plots.json
Aggregate plots by rent_1
Display summary cards
Render polygons on Google Maps
Provide filtering capabilities

🏗️ Tech Stack
Backend
ASP.NET Core (MVC) C#
System.Text.Json (for JSON parsing)
ProjNet (UTM→WGS84 coordinate conversion)
Frontend
HTML, CSS, JavaScript
Google Maps JavaScript API
Bootstrap (layout)

📁 Project Structure
/LandPlotsExplorer
 ├── Controllers/
 │    ├── Api/PlotsApiController.cs
 │    └── HomeController.cs
 ├── Services/
 │    └── PlotService.cs
 ├── Models/
 │    └── Plot.cs
 ├── wwwroot/
 │    ├── js/
 │    └── css/
 ├── Views/
 │    └── Home/Index.cshtml   (single page: dashboard + map)
 ├── Data/
 │    └── plots.json
 └── Program.cs

📦 Data Handling
Input File
File: Data/plots.json
Contains ~6000 plot records (PlotFeatureSet format with a `features` array)
Each record includes:
attributes
geometry.rings (UTM Zone 37N coordinates → converted to WGS84 on load)

Model Classes (Models/Plot.cs)
class Plot
{
    public Attributes Attributes { get; set; }
    public Geometry Geometry { get; set; }
}

class Attributes
{
    public int OBJECTID { get; set; }
    public string PLAN_NUM_1 { get; set; }
    public string parcel_n_12 { get; set; }
    public string dis_nam_1 { get; set; }
    public string plan_nam_1 { get; set; }
    public double? x_12 { get; set; }       // fallback longitude (WGS84)
    public double? y_23 { get; set; }       // fallback latitude (WGS84)
    public string? rent_1 { get; set; }
    public string? main_act_1 { get; set; }
    public string? sub_acti_1 { get; set; }
    public string? location_1 { get; set; }
    public string? site_inf_1 { get; set; }
    public string? municipa_1 { get; set; }
    public string? property_1 { get; set; }
    public string? notes_1 { get; set; }
    public double? Shape_Area { get; set; }

    // قيد الطرح exclusive fields (tender/auction data)
    public string? name { get; set; }
    public string? activity { get; set; }
    public long? area { get; set; }
    public double? buckletPrice { get; set; }
    public string? contractPeriod { get; set; }
    public string? forsaNumber { get; set; }
    public string? forusLink { get; set; }
    public long? advertiseDate { get; set; }      // epoch ms
    public long? openEnvelopesDate { get; set; }  // epoch ms
}

class Geometry
{
    public List<List<List<double>>> rings { get; set; }
}

class PlotDto       // serialized to client; includes all Attributes fields + converted rings
class FilterCriteria
class RentSummaryItem
class PlotFeatureSet   // top-level JSON wrapper

⚙️ Core Services
PlotService (Singleton)

Responsibilities:
Load JSON once on startup (singleton)
Filter out "تم احالة الاشراف للزراعة" records on load
Cache data in memory
Convert UTM rings to WGS84 in ToDto()
Provide querying methods:
  List<Plot> GetAllPlots();
  List<RentSummaryItem> GetRentStatistics();
  List<Plot> GetPlotsByRent(string rentStatus);
  List<Plot> FilterPlots(FilterCriteria criteria);
  PlotDto ToDto(Plot plot);   // converts geometry + maps all fields including قيد الطرح extras
  GetDistricts(), GetMainActivities(), GetSubActivities()
  GetMinArea(), GetMaxArea()

rent_1 Labels & Colors:
  مؤجر         → "مستثمر"      #db0f0f
  غير مؤجر     → "غير مستثمر"  #22c55e
  تم احالة الاشراف للزراعة → "نفع عام" #f59e0b  (filtered out on load, not shown)
  قيد الطرح    → "قيد الطرح"   #1512c5
  (empty)      → "Unknown"     #6b7280

🏠 Single Page: Home (/)
The app is a single-page layout with no navbar. HomeController.Index() serves everything.

Layout (top to bottom, full viewport height):
1. Dashboard section (flex-shrink: 0)
   - Title "لوحة تحكم الأراضي" + total plots count
   - Responsive cards grid (one card per rent_1 category)
   - Clicking a card filters the map in-place (no navigation); active card gets a colored ring
2. Map section (flex: 1, fills remaining height)
   - Collapsible filters sidebar (right side)
   - Google Map (fills remaining width)

HomeController passes to View:
  ViewBag.RentStatus      — optional ?rent= query param (pre-selects a card)
  ViewBag.RentSummary     — List<RentSummaryItem>
  ViewBag.Districts       — List<string>
  ViewBag.MainActivities  — List<string>
  ViewBag.SubActivities   — List<string>
  ViewBag.MinArea / MaxArea
  ViewBag.GoogleMapsApiKey

🗺️ Map
Initialize map centered at { lat: 30.99, lng: 40.95 }, zoom 14
Convert rings → google.maps.Polygon (UTM→WGS84 done server-side in ToDto)
Color polygons by rent_1 using RENT_COLORS map

📌 Polygon Info Window (on click)
Shows for all plots:
  رقم القطعة (OBJECTID)
  الحي (dis_nam_1)
  رقم المخطط (PLAN_NUM_1)
  الحالة (rent_1)
  النشاط الرئيسي (main_act_1)
  النشاط الفرعي (sub_acti_1)
  الموقع (location_1)
  المساحة (Shape_Area)
  ملاحظات (notes_1)

Additional section shown ONLY for rent_1 === 'قيد الطرح':
  اسم الموقع (name)
  النشاط (activity)
  المساحة المطروحة (area) in م²
  سعر الدلو (buckletPrice) in ريال
  مدة العقد (contractPeriod)
  رقم الفرصة (forsaNumber)
  تاريخ الإعلان (advertiseDate, epoch ms → Arabic date string)
  تاريخ فتح المظاريف (openEnvelopesDate, epoch ms → Arabic date string)
  رابط فرصة فرص (forusLink, clickable link)

🎛️ Filters Sidebar
  District (dis_nam_1) → dropdown
  Main Activity (main_act_1) → dropdown
  Sub Activity (sub_acti_1) → dropdown
  Area (Shape_Area) → min/max number inputs

🔍 Filtering Logic
Client sends filter state; server filters in FilterPlots()
GET /api/plots?rent=VALUE for single rent filter (no other filters)
POST /api/plots/filter for multi-criteria filtering

🚀 API Endpoints
GET /api/plots/rent-summary       → List<RentSummaryItem>
GET /api/plots?rent=VALUE         → List<PlotDto>
POST /api/plots/filter            → List<PlotDto>  (body: FilterCriteria)
GET /api/plots/districts          → List<string>
GET /api/plots/main-activities    → List<string>
GET /api/plots/sub-activities     → List<string>
GET /api/plots/area-range         → { min, max }

⚡ Performance Considerations
Singleton PlotService — JSON loaded once on startup
UTM→WGS84 conversion done per request in ToDto (not cached)
Consider pre-converting and caching if performance is a concern

🎨 UI Requirements (Arabic UI, dir="rtl")
No navbar — app fills full viewport height
Dashboard section: compact cards (44px icon, 1.5rem count font), responsive grid
Map section: full remaining height, collapsible right sidebar

⚠️ Edge Cases
rent_1 = null/empty
Missing geometry rings (falls back to x_12/y_23 coordinates)
Invalid polygon rings
Empty filter results
قيد الطرح extra fields may be null for some records

✅ Definition of Done
Home page shows correct counts per rent category
Clicking a card filters the map in-place and highlights the active card
Polygons render with correct color per rent status
Filters sidebar dynamically updates results
Clicking polygon shows full attributes
قيد الطرح polygons show tender-specific section in info window
