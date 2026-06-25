using LandPlotsExplorer.Models;
using LandPlotsExplorer.Services;
using Microsoft.AspNetCore.Mvc;

namespace LandPlotsExplorer.Controllers.Api;

[ApiController]
[Route("api/plots")]
public class PlotsApiController : ControllerBase
{
    private readonly PlotService _plotService;

    public PlotsApiController(PlotService plotService)
    {
        _plotService = plotService;
    }

    [HttpGet("rent-summary")]
    public ActionResult<List<RentSummaryItem>> GetRentSummary()
    {
        return Ok(_plotService.GetRentStatistics());
    }

    [HttpGet]
    public ActionResult<List<PlotDto>> GetPlots([FromQuery] string? rent)
    {
        var plots = string.IsNullOrEmpty(rent)
            ? _plotService.GetAllPlots()
            : _plotService.GetPlotsByRent(rent);

        return Ok(plots.Select(p => _plotService.ToDto(p)).ToList());
    }

    [HttpPost("filter")]
    public ActionResult<List<PlotDto>> FilterPlots([FromBody] FilterCriteria criteria)
    {
        var plots = _plotService.FilterPlots(criteria);
        return Ok(plots.Select(p => _plotService.ToDto(p)).ToList());
    }

    [HttpGet("districts")]
    public ActionResult<List<string>> GetDistricts()
    {
        return Ok(_plotService.GetDistricts());
    }

    [HttpGet("main-activities")]
    public ActionResult<List<string>> GetMainActivities()
    {
        return Ok(_plotService.GetMainActivities());
    }

    [HttpGet("sub-activities")]
    public ActionResult<List<string>> GetSubActivities()
    {
        return Ok(_plotService.GetSubActivities());
    }

    [HttpGet("area-range")]
    public ActionResult<object> GetAreaRange()
    {
        return Ok(new { min = _plotService.GetMinArea(), max = _plotService.GetMaxArea() });
    }
}
