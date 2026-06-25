namespace LandPlotsExplorer.Models;

public class Plot
{
    public Attributes Attributes { get; set; } = new();
    public Geometry Geometry { get; set; } = new();
}

public class Attributes
{
    public int OBJECTID { get; set; }
    public string PLAN_NUM_1 { get; set; } = string.Empty;
    public string parcel_n_12 { get; set; } = string.Empty;
    public string dis_nam_1 { get; set; } = string.Empty;
    public string plan_nam_1 { get; set; } = string.Empty;
    public double? x_12 { get; set; }
    public double? y_23 { get; set; }
    public string? rent_1 { get; set; }
    public string? main_act_1 { get; set; }
    public string? sub_acti_1 { get; set; }
    public string? location_1 { get; set; }
    public string? site_inf_1 { get; set; }
    public string? municipa_1 { get; set; }
    public string? property_1 { get; set; }
    public string? notes_1 { get; set; }
    public double? Shape_Area { get; set; }

    // قيد الطرح exclusive fields
    public string? name { get; set; }
    public string? activity { get; set; }
    public double? area { get; set; }
    public double? buckletPrice { get; set; }
    public string? contractPeriod { get; set; }
    public string? forsaNumber { get; set; }
    public string? forusLink { get; set; }
    public long? advertiseDate { get; set; }
    public long? openEnvelopesDate { get; set; }
}

public class Geometry
{
    public List<List<List<double>>> rings { get; set; } = new();
}

public class PlotFeatureSet
{
    public string displayFieldName { get; set; } = string.Empty;
    public string geometryType { get; set; } = string.Empty;
    public SpatialReference spatialReference { get; set; } = new();
    public List<Plot> features { get; set; } = new();
}

public class SpatialReference
{
    public int wkid { get; set; }
    public int latestWkid { get; set; }
}

public class FilterCriteria
{
    public string? DisName { get; set; }
    public string? MainActivity { get; set; }
    public string? SubActivity { get; set; }
    public double? MinArea { get; set; }
    public double? MaxArea { get; set; }
    public string? RentStatus { get; set; }
}

public class RentSummaryItem
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int Count { get; set; }
    public string Color { get; set; } = string.Empty;
}

public class PlotDto
{
    public int OBJECTID { get; set; }
    public string PLAN_NUM_1 { get; set; } = string.Empty;
    public string dis_nam_1 { get; set; } = string.Empty;
    public string? rent_1 { get; set; }
    public string? main_act_1 { get; set; }
    public string? sub_acti_1 { get; set; }
    public string? location_1 { get; set; }
    public double? Shape_Area { get; set; }
    public string? notes_1 { get; set; }
    public List<List<List<double>>> rings { get; set; } = new();
    public double CenterLat { get; set; }
    public double CenterLng { get; set; }

    // قيد الطرح exclusive fields
    public string? name { get; set; }
    public string? activity { get; set; }
    public double? area { get; set; }
    public double? buckletPrice { get; set; }
    public string? contractPeriod { get; set; }
    public string? forsaNumber { get; set; }
    public string? forusLink { get; set; }
    public long? advertiseDate { get; set; }
    public long? openEnvelopesDate { get; set; }
}
