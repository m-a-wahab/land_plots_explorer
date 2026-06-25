using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using LandPlotsExplorer.Models;
using LandPlotsExplorer.Services;

namespace LandPlotsExplorer.Controllers;

public class HomeController : Controller
{
    private readonly PlotService _plotService;
    private readonly IConfiguration _config;

    public HomeController(PlotService plotService, IConfiguration config)
    {
        _plotService = plotService;
        _config = config;
    }

    public IActionResult Index([FromQuery] string? rent)
    {
        ViewBag.RentStatus = rent ?? "";
        ViewBag.RentSummary = _plotService.GetRentStatistics();
        ViewBag.Districts = _plotService.GetDistricts();
        ViewBag.MainActivities = _plotService.GetMainActivities();
        ViewBag.SubActivities = _plotService.GetSubActivities();
        ViewBag.MinArea = _plotService.GetMinArea();
        ViewBag.MaxArea = _plotService.GetMaxArea();
        ViewBag.GoogleMapsApiKey = _config["GoogleMapsApiKey"] ?? "YOUR_API_KEY";
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
