from worldgen import site_urls


def test_deployed_url_ignores_the_tunnel(monkeypatch):
    monkeypatch.setenv("ES_TUNNEL_URL", "https://tunnel.example/x")
    assert site_urls.studio_url(local=False) == "https://jtattersall09403.github.io/elder-souls-argonia/studio/"
    assert site_urls.STUDIO_URL == site_urls.PAGES_URL + "studio/"


def test_local_uses_the_tunnel_only_when_set(monkeypatch):
    monkeypatch.setenv("ES_TUNNEL_URL", "https://tunnel.example/x")
    assert site_urls.studio_url(local=True) == "https://tunnel.example/x/"
    monkeypatch.delenv("ES_TUNNEL_URL")
    assert site_urls.studio_url(local=True) == site_urls.STUDIO_URL
