require 'digest/md5'
require 'fileutils'
require 'json'

def read_dir(dir, filelist = [])
  Dir.entries(dir).each do |file|
    next if file == '.' || file == '..'
    file_path = File.join(dir, file)
    if File.directory?(file_path)
      next if file == 's'
      filelist = read_dir(file_path, filelist)
    elsif file == 'index.html'
      filelist << file_path
    end
  end
  filelist
end

def md5(str)
  Digest::MD5.hexdigest(str)
end

def long_url_to_short_id(long_url, i)
  hash = md5(long_url + i.to_s)
  hash[0, 6]
end

def generate_short_url(filelist, base_url, site_path, short_url_path)
  short_ids = {}
  short_routes = []
  filelist.each do |file|
    long_url = base_url + file.gsub(/\\/,'/').gsub(/^_site\//, '').gsub(/index\.html$/, '')
    i = 0
    short_id = long_url_to_short_id(long_url, i)
    while short_ids[short_id]
      puts "重复短地址： #{i} #{short_ids} #{short_ids[short_id]} #{short_url}"
      i += 1
      short_id = long_url_to_short_id(long_url, i)
    end
    short_ids[short_id] = long_url
    short_url = base_url + short_url_path + short_id
    short_routes << [short_url, long_url]
    puts "#{long_url} #{short_url}"
    FileUtils.mkdir_p(File.join(site_path, short_url_path, short_id))
    File.write(File.join(site_path, short_url_path, short_id, 'index.html'), "<meta http-equiv=\"refresh\" content=\"0; url=#{long_url}\" />")
  end
  File.write(File.join(site_path, short_url_path, 'short-routes.json'), JSON.pretty_generate(short_routes))
end

base_url = 'https://hibikilogy.github.io/'
site_path = '_site'
short_url_path = 's/'

filelist = read_dir(site_path)
generate_short_url(filelist, base_url, site_path, short_url_path)