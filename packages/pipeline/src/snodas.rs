use chrono::NaiveDate;
use std::fmt;

pub const MASKED_COLS: u32 = 6935;
pub const MASKED_ROWS: u32 = 3351;
pub const NODATA_VALUE: i16 = -9999;
pub const COORDINATE_SHIFT_DATE: &str = "2013-10-01";

#[derive(Debug, Clone, Copy)]
pub struct BoundingBox {
    pub west: f64,
    pub east: f64,
    pub north: f64,
    pub south: f64,
}

impl BoundingBox {
    pub fn pixel_size_x(&self) -> f64 {
        (self.east - self.west) / MASKED_COLS as f64
    }

    pub fn pixel_size_y(&self) -> f64 {
        (self.south - self.north) / MASKED_ROWS as f64
    }
}

pub const BBOX_PRE_2013: BoundingBox = BoundingBox {
    west: -124.733_75,
    east: -66.942_08,
    north: 52.874_58,
    south: 24.949_58,
};

pub const BBOX_POST_2013: BoundingBox = BoundingBox {
    west: -124.733_333_333_333_33,
    east: -66.941_666_666_666_66,
    north: 52.875,
    south: 24.95,
};

pub fn get_bbox_for_date(date: NaiveDate) -> BoundingBox {
    let shift_date = NaiveDate::parse_from_str(COORDINATE_SHIFT_DATE, "%Y-%m-%d").unwrap();
    if date < shift_date {
        BBOX_PRE_2013
    } else {
        BBOX_POST_2013
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProductId {
    Swe = 1034,
    SnowDepth = 1036,
    SnowMeltRunoff = 1044,
    Sublimation = 1050,
    SublimationBlowing = 1039,
    Precipitation = 1025,
    SnowpackAverageTemp = 1038,
}

impl ProductId {
    pub fn from_code(code: u32) -> Option<Self> {
        match code {
            1034 => Some(Self::Swe),
            1036 => Some(Self::SnowDepth),
            1044 => Some(Self::SnowMeltRunoff),
            1050 => Some(Self::Sublimation),
            1039 => Some(Self::SublimationBlowing),
            1025 => Some(Self::Precipitation),
            1038 => Some(Self::SnowpackAverageTemp),
            _ => None,
        }
    }

    pub fn code(&self) -> u32 {
        *self as u32
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Swe => "swe",
            Self::SnowDepth => "snow_depth",
            Self::SnowMeltRunoff => "snow_melt_runoff",
            Self::Sublimation => "sublimation",
            Self::SublimationBlowing => "sublimation_blowing",
            Self::Precipitation => "precipitation",
            Self::SnowpackAverageTemp => "snowpack_avg_temp",
        }
    }

    pub fn scale_factor(&self) -> f64 {
        match self {
            Self::Swe => 1.0,
            Self::SnowDepth => 1.0,
            Self::SnowMeltRunoff => 100_000.0,
            Self::Sublimation => 100_000.0,
            Self::SublimationBlowing => 100_000.0,
            Self::Precipitation => 10.0,
            Self::SnowpackAverageTemp => 1.0,
        }
    }
}

impl fmt::Display for ProductId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

pub fn parse_product_ids(input: &str) -> Vec<ProductId> {
    input
        .split(',')
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .filter_map(ProductId::from_code)
        .collect()
}

pub fn build_nsidc_url(date: NaiveDate) -> String {
    let year = date.format("%Y");
    let month_dir = date.format("%m_%b");
    let filename = date.format("SNODAS_%Y%m%d.tar");
    format!(
        "https://noaadata.apps.nsidc.org/NOAA/G02158/masked/{}/{}/{}",
        year, month_dir, filename
    )
}

#[derive(Debug, Clone)]
pub struct SnodasFile {
    pub date: NaiveDate,
    pub product_id: ProductId,
    pub filename: String,
    pub is_model: bool,
    pub hour: u8,
}

impl SnodasFile {
    pub fn parse_filename(filename: &str) -> Option<Self> {
        if !filename.ends_with(".dat") && !filename.ends_with(".dat.gz") {
            return None;
        }

        let base = filename
            .trim_end_matches(".gz")
            .trim_end_matches(".dat");

        let parts: Vec<&str> = base.split('_').collect();
        if parts.len() < 4 {
            return None;
        }

        let region = parts[0];
        if region != "us" {
            return None;
        }

        let product_part = parts[1];
        let product_code_str: String = product_part
            .chars()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit())
            .collect();

        let full_code: u32 = product_code_str.parse().ok()?;
        let product_code = full_code % 10000;

        let product_id = ProductId::from_code(product_code)?;

        let is_model = product_part.contains("Sl");

        let full_str = base;
        let ttnats_pos = full_str.find("TTNATS")?;
        let date_start = ttnats_pos + 6;

        if date_start + 10 > full_str.len() {
            return None;
        }

        let date_part = &full_str[date_start..date_start + 10];

        let year: i32 = date_part[0..4].parse().ok()?;
        let month: u32 = date_part[4..6].parse().ok()?;
        let day: u32 = date_part[6..8].parse().ok()?;
        let hour: u8 = date_part[8..10].parse().ok()?;

        let date = NaiveDate::from_ymd_opt(year, month, day)?;

        Some(Self {
            date,
            product_id,
            filename: filename.to_string(),
            is_model,
            hour,
        })
    }

    pub fn output_filename(&self) -> String {
        format!(
            "snodas_{}_{}.tif",
            self.product_id.name(),
            self.date.format("%Y%m%d")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_filename() {
        let filename = "us_ssmv11034tS__T0001TTNATS2023120105HP001.dat.gz";
        let parsed = SnodasFile::parse_filename(filename).unwrap();
        assert_eq!(parsed.product_id, ProductId::Swe);
        assert_eq!(parsed.date, NaiveDate::from_ymd_opt(2023, 12, 1).unwrap());
    }

    #[test]
    fn test_bbox_selection() {
        let pre = NaiveDate::from_ymd_opt(2013, 9, 30).unwrap();
        let post = NaiveDate::from_ymd_opt(2013, 10, 1).unwrap();

        let bbox_pre = get_bbox_for_date(pre);
        let bbox_post = get_bbox_for_date(post);

        assert!((bbox_pre.west - BBOX_PRE_2013.west).abs() < 0.0001);
        assert!((bbox_post.west - BBOX_POST_2013.west).abs() < 0.0001);
    }

    #[test]
    fn test_build_url() {
        let date = NaiveDate::from_ymd_opt(2023, 12, 15).unwrap();
        let url = build_nsidc_url(date);
        assert!(url.contains("2023"));
        assert!(url.contains("12_Dec"));
        assert!(url.contains("SNODAS_20231215.tar"));
    }
}
