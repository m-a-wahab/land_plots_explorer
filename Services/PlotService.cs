using LandPlotsExplorer.Models;
using Microsoft.Extensions.ObjectPool;
using Microsoft.VisualBasic;
using ProjNet.CoordinateSystems;
using ProjNet.CoordinateSystems.Transformations;
using System.Text.Json;

namespace LandPlotsExplorer.Services;

public class PlotService
{
    private readonly List<Plot> _plots = new();
    private readonly Dictionary<string, string> _rentLabels = new()
    {
        { "مؤجر", "مستثمر" },
        { "غير مؤجر", "غير مستثمر" },
        { "تم احالة الاشراف للزراعة", "نفع عام" },
        {"قيد الطرح", "قيد الطرح"},
        { "", "Unknown" }
    };
    private readonly Dictionary<string, string> _rentColors = new()
    {
        { "مؤجر", "#db0f0f" },
        { "غير مؤجر", "#22c55e" },
        { "تم احالة الاشراف للزراعة", "#f59e0b" },
        {"قيد الطرح", "#1512c5"},
        { "", "#6b7280" }
    };

    private readonly JsonSerializerOptions _jsonSerializationOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public PlotService(IWebHostEnvironment env)
    {
        var filePath = Path.Combine(env.ContentRootPath, "Data", "plots.json");
        if (!File.Exists(filePath))
            throw new FileNotFoundException($"plots.json not found at {filePath}");

        var json = File.ReadAllText(filePath);
        var featureSet = JsonSerializer.Deserialize<PlotFeatureSet>(json, _jsonSerializationOptions);

        if (featureSet?.features != null)
        {
            _plots = [.. featureSet.features.Where(f => f.Attributes.rent_1 != "تم احالة الاشراف للزراعة")];
        }
    }

    public List<Plot> GetAllPlots() => _plots;

    public List<RentSummaryItem> GetRentStatistics()
    {
        var stats = _plots.Where(p => !string.IsNullOrWhiteSpace(p.Attributes.rent_1))
            .GroupBy(p => p.Attributes.rent_1 ?? "")
            .Select(g => new RentSummaryItem
            {
                Key = g.Key,
                Label = _rentLabels.GetValueOrDefault(g.Key, "Unknown"),
                Count = g.Count(),
                Color = _rentColors.GetValueOrDefault(g.Key, "#6b7280")
            })
            .OrderByDescending(s => s.Count)
            .ToList();

        return stats;
    }

    public List<Plot> GetPlotsByRent(string rentStatus)
    {
        return _plots.Where(p => (p.Attributes.rent_1 ?? "") == rentStatus).ToList();
    }

    public List<Plot> FilterPlots(FilterCriteria criteria)
    {
        var query = _plots.AsEnumerable();

        if (!string.IsNullOrEmpty(criteria.RentStatus))
            query = query.Where(p => (p.Attributes.rent_1 ?? "") == criteria.RentStatus);

        if (!string.IsNullOrEmpty(criteria.DisName))
            query = query.Where(p => p.Attributes.dis_nam_1 == criteria.DisName);

        if (!string.IsNullOrEmpty(criteria.MainActivity))
            query = query.Where(p => p.Attributes.main_act_1 == criteria.MainActivity);

        if (!string.IsNullOrEmpty(criteria.SubActivity))
            query = query.Where(p => p.Attributes.sub_acti_1 == criteria.SubActivity);

        if (criteria.MinArea.HasValue)
            query = query.Where(p => p.Attributes.Shape_Area >= criteria.MinArea.Value);

        if (criteria.MaxArea.HasValue)
            query = query.Where(p => p.Attributes.Shape_Area <= criteria.MaxArea.Value);

        return query.ToList();
    }

    public List<string> GetDistricts() =>
        _plots.Select(p => p.Attributes.dis_nam_1).Where(d => !string.IsNullOrEmpty(d)).Distinct().OrderBy(d => d).ToList();

    public List<string> GetMainActivities() =>
        _plots.Select(p => p.Attributes.main_act_1).OfType<string>().Where(a => !string.IsNullOrEmpty(a)).Distinct().OrderBy(a => a).ToList();

    public List<string> GetSubActivities() =>
        _plots.Select(p => p.Attributes.sub_acti_1).OfType<string>().Where(a => !string.IsNullOrEmpty(a)).Distinct().OrderBy(a => a).ToList();

    public double GetMinArea() => _plots.Where(p => p.Attributes.Shape_Area.HasValue).Min(p => p.Attributes.Shape_Area!.Value);
    public double GetMaxArea() => _plots.Where(p => p.Attributes.Shape_Area.HasValue).Max(p => p.Attributes.Shape_Area!.Value);

    public static (double Lat, double Lng) UtmToWgs84(
    double easting,
    double northing,
    int zone = 37)
    {

        // Create coordinate systems
        var csFactory = new CoordinateSystemFactory();
        var ctFactory = new CoordinateTransformationFactory();

        // Source: WGS84 / UTM Zone
        var utm = ProjectedCoordinateSystem.WGS84_UTM(zone, true);

        // Target: WGS84 Lat/Lng
        var wgs84 = GeographicCoordinateSystem.WGS84;

        // Create transformation
        var transform = ctFactory.CreateFromCoordinateSystems(
            utm,
            wgs84);

        // Convert
        double[] result = transform.MathTransform.Transform(
            new[] { easting, northing });

        // ProjNET returns:
        // result[0] = Longitude
        // result[1] = Latitude
        return (result[1], result[0]);
    }

    public PlotDto ToDto(Plot plot)
    {
        var firstRing = plot.Geometry.rings.FirstOrDefault();
        double centerLat = 0, centerLng = 0;

        if (firstRing != null && firstRing.Count > 0)
        {
            var converted = firstRing.Select(c => UtmToWgs84(c[0], c[1])).ToList();
            centerLat = converted.Average(c => c.Lat);
            centerLng = converted.Average(c => c.Lng);

            var wgs84Rings = plot.Geometry.rings
                .Select(ring => ring
                    .Select(c =>
                    {
                        var (lat, lng) = UtmToWgs84(c[0], c[1]);
                        return new List<double> { lng, lat };
                    })
                    .ToList())
                .ToList();

            return new PlotDto
            {
                OBJECTID = plot.Attributes.OBJECTID,
                PLAN_NUM_1 = plot.Attributes.PLAN_NUM_1,
                dis_nam_1 = plot.Attributes.dis_nam_1,
                rent_1 = plot.Attributes.rent_1,
                main_act_1 = plot.Attributes.main_act_1,
                sub_acti_1 = plot.Attributes.sub_acti_1,
                location_1 = plot.Attributes.location_1,
                Shape_Area = plot.Attributes.Shape_Area ?? 0,
                rings = wgs84Rings,
                CenterLat = centerLat,
                CenterLng = centerLng,
                name = plot.Attributes.name,
                activity = plot.Attributes.activity,
                area = plot.Attributes.area,
                buckletPrice = plot.Attributes.buckletPrice,
                contractPeriod = plot.Attributes.contractPeriod,
                forsaNumber = plot.Attributes.forsaNumber,
                forusLink = plot.Attributes.forusLink,
                advertiseDate = plot.Attributes.advertiseDate,
                openEnvelopesDate = plot.Attributes.openEnvelopesDate
            };
        }

        return new PlotDto
        {
            OBJECTID = plot.Attributes.OBJECTID,
            PLAN_NUM_1 = plot.Attributes.PLAN_NUM_1,
            dis_nam_1 = plot.Attributes.dis_nam_1,
            rent_1 = plot.Attributes.rent_1,
            main_act_1 = plot.Attributes.main_act_1,
            sub_acti_1 = plot.Attributes.sub_acti_1,
            location_1 = plot.Attributes.location_1,
            Shape_Area = plot.Attributes.Shape_Area ?? 0,
            CenterLat = plot.Attributes.y_23 ?? 0,
            CenterLng = plot.Attributes.x_12 ?? 0,
            name = plot.Attributes.name,
            activity = plot.Attributes.activity,
            area = plot.Attributes.area,
            buckletPrice = plot.Attributes.buckletPrice,
            contractPeriod = plot.Attributes.contractPeriod,
            forsaNumber = plot.Attributes.forsaNumber,
            forusLink = plot.Attributes.forusLink,
            advertiseDate = plot.Attributes.advertiseDate,
            openEnvelopesDate = plot.Attributes.openEnvelopesDate
        };
    }
}
