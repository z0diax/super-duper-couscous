(function(){
  var root=document.documentElement;
  try{
    var mode=localStorage.getItem('hrmdo-dts.appearance.mode');
    var dark=mode==='dark'||(mode!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.appearance=dark?'dark':'light';
    var cached=JSON.parse(localStorage.getItem('hrmdo-dts.theme-state.v1')||'null');
    var themes=['classic','valentine','womens-month','amihan-bloom','winter','chinese-new-year','hallo-christmas','government','festive','rainy-season','weather-sync'];
    var weather=['sunny','cloudy','windy','rainy','thunderstorm','winter'];
    var theme=cached&&themes.indexOf(cached.theme)>=0?cached.theme:'classic';
    root.dataset.systemTheme=theme;
    if(theme==='weather-sync'&&weather.indexOf(cached&&cached.effectiveWeatherTheme)>=0) root.dataset.weatherTheme=cached.effectiveWeatherTheme;
    else delete root.dataset.weatherTheme;
  }catch(e){root.dataset.appearance='light';root.dataset.systemTheme='classic';delete root.dataset.weatherTheme;}
})();
